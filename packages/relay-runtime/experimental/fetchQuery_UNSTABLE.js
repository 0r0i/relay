/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const getRequestKey_UNSTABLE = require('./getRequestKey_UNSTABLE');
const invariant = require('invariant');

import type {ExecutePayload} from '../network/RelayNetworkTypes';
import type {Observer, Subscription} from '../network/RelayObservable';
import type {GraphQLTaggedNode} from '../query/RelayModernGraphQLTag';
import type {Environment} from '../store/RelayStoreTypes';
import type {
  CacheConfig,
  Disposable,
  OperationType,
} from '../util/RelayRuntimeTypes';

type ObserverEvent = {|
  event: 'start' | 'next' | 'error' | 'complete' | 'unsubscribe',
  data?: mixed,
|};

type RequestCacheEntry = {|
  subscription: Subscription,
  receivedEvents: Array<ObserverEvent>,
  observers: Array<Observer<ExecutePayload>>,
|};

type ReferencesCacheEntry = {|
  count: number,
  references: Array<Disposable>,
|};

const requestsByEnvironment: Map<
  Environment,
  Map<string, RequestCacheEntry>,
> = new Map();
const referencesByEnvironment: Map<
  Environment,
  Map<string, ReferencesCacheEntry>,
> = new Map();

/**
 * Facilitates fetching a query given its variables and an environment, while
 * retaining data for the query and de-duping identical requests that are
 * _in-flight_.
 *
 * Observing a request:
 * ====================
 * fetchQuery_UNSTABLE takes an Observer which you can use to observe network
 * responses and other events like errors or when the request is complete:
 *
 * ```
 * fetchQuery_UNSTABLE(environment, query, variables, {
 *   // Called when network requests starts
 *   start: (subsctiption) => {},
 *
 *   // Called after a payload is received and written to the local store
 *   next: (payload) => {},
 *
 *   // Called when network requests errors
 *   error: (error) => {},
 *
 *   // Called when network requests fully completes
 *   complete: () => {},
 *
 *   // Called when network request is unsubscribed
 *   unsubscribe: (subscription) => {},
 * });
 * ```
 *
 * In-flight request de-duping:
 * ============================
 * By default, calling fetchQuery_UNSTABLE multiple times with the same
 * environment, query and variables will not initiate a new request if a request
 * for those same parameters is already in flight.
 *
 * A request is marked in-flight from the moment it starts until the moment it
 * fully completes, regardless of error or successful completion.
 *
 * NOTE: If the request completes _synchronously_, calling fetchQuery_UNSTABLE
 * a second time with the same arguments in the same tick will _NOT_ de-dupe
 * the request given that it will no longer be in-flight.
 *
 *
 * Data Retention:
 * ===============
 * This function will _retain_ data for the given query and variables on the
 * provided Relay environment; this means that it prevent that data from being
 * garbage collected (i.e. deleted) from the Relay store.
 * In order to release the data, the will return a Disposable which can be used to
 * dispose of the retained data:
 *
 * ```
 * const disposable = fetchQuery_UNSTABLE(...);
 *
 * // After calling this, the data might be garbage collected (i.e. deleted)
 * // from the Relay local store
 * diposable.dispose();
 * ```
 */
function fetchQuery_UNSTABLE<TQuery: OperationType>(args: {|
  environment: Environment,
  query: GraphQLTaggedNode,
  variables: $ElementType<TQuery, 'variables'>,
  observer?: Observer<ExecutePayload>,
  networkLayerCacheConfig?: CacheConfig,
|}): Disposable {
  const {
    environment,
    query,
    variables,
    observer,
    networkLayerCacheConfig,
  } = args;
  const {createOperationSelector, getRequest} = environment.unstable_internal;
  const queryRequestNode = getRequest(query);
  invariant(
    queryRequestNode.operationKind === 'query',
    'fetchQuery_UNSTABLE: Expected query operation',
  );
  const requestCache = getRequestCache(environment);
  const referencesCache = getReferencesCache(environment);
  const operation = createOperationSelector(queryRequestNode, variables);
  const cacheKey = getRequestKey_UNSTABLE(queryRequestNode, variables);
  const cachedRequest = requestCache.get(cacheKey);
  const cachedReferences = referencesCache.get(cacheKey);

  if (cachedReferences) {
    referencesCache.set(cacheKey, {
      ...cachedReferences,
      count: cachedReferences.count + 1,
    });
  } else {
    referencesCache.set(cacheKey, {
      references: [],
      count: 1,
    });
  }

  if (cachedRequest) {
    // We manage observers manually due to the lack of an RxJS Subject abstraction
    // (https://fburl.com/s6m56gim)
    const observers =
      observer && !cachedRequest.observers.find(o => o === observer)
        ? [...cachedRequest.observers, observer]
        : cachedRequest.observers;

    if (observer) {
      cachedRequest.receivedEvents.forEach(observerEvent => {
        const {data} = observerEvent;
        // eslint-disable-next-line lint/flow-no-fixme
        const eventHandler: $FlowFixMe = observer[observerEvent.event];
        if (data !== undefined) {
          eventHandler && eventHandler(data);
        } else {
          eventHandler && eventHandler();
        }
      });
    }
    requestCache.set(cacheKey, {
      ...cachedRequest,
      observers,
    });
  } else {
    environment
      .execute({operation, cacheConfig: networkLayerCacheConfig})
      .map(payload => {
        const operationForPayload = createOperationSelector(
          operation.node,
          payload.variables,
          payload.operation,
        );
        const cached = referencesCache.get(cacheKey);
        invariant(
          cached != null,
          'fetchQuery_UNSTABLE: Expected references to be cached',
        );
        cached.references.push(environment.retain(operationForPayload.root));
        return payload;
      })
      .finally(() => {
        requestCache.delete(cacheKey);
      })
      .subscribe({
        start: subscription => {
          requestCache.set(cacheKey, {
            subscription: subscription,
            observers: observer ? [observer] : [],
            receivedEvents: [],
          });
          addReceivedEvent(requestCache, cacheKey, {
            event: 'start',
            data: subscription,
          });
          getCachedObservers(requestCache, cacheKey).forEach(
            o => o.start && o.start(subscription),
          );
        },
        next: payload => {
          addReceivedEvent(requestCache, cacheKey, {
            event: 'next',
            data: payload,
          });
          getCachedObservers(requestCache, cacheKey).forEach(
            o => o.next && o.next(payload),
          );
        },
        error: error => {
          addReceivedEvent(requestCache, cacheKey, {
            event: 'error',
            data: error,
          });
          getCachedObservers(requestCache, cacheKey).forEach(
            o => o.error && o.error(error),
          );
        },
        complete: () => {
          addReceivedEvent(requestCache, cacheKey, {
            event: 'complete',
          });
          getCachedObservers(requestCache, cacheKey).forEach(
            o => o.complete && o.complete(),
          );
        },
        unsubscribe: subscription => {
          addReceivedEvent(requestCache, cacheKey, {
            event: 'unsubscribe',
            data: subscription,
          });
          getCachedObservers(requestCache, cacheKey).forEach(
            o => o.unsubscribe && o.unsubscribe(subscription),
          );
        },
      });
  }

  return {
    dispose: () => {
      const cachedRefs = referencesCache.get(cacheKey);
      invariant(
        cachedRefs != null,
        'fetchQuery_UNSTABLE: Expected references to be cached',
      );
      const {count, references} = cachedRefs;
      if (count === 1) {
        references.forEach(r => r.dispose());
        referencesCache.delete(cacheKey);

        const cachedReq = requestCache.get(cacheKey);
        if (cachedReq) {
          cachedReq.subscription.unsubscribe();
        }
      } else {
        referencesCache.set(cacheKey, {
          references,
          count: Math.max(0, count - 1),
        });
      }
    },
  };
}

function getRequestCache(
  environment: Environment,
): Map<string, RequestCacheEntry> {
  const cached = requestsByEnvironment.get(environment);
  if (cached != null) {
    return cached;
  }
  const requestCache = new Map();
  requestsByEnvironment.set(environment, requestCache);
  return requestCache;
}

function getReferencesCache(
  environment: Environment,
): Map<string, ReferencesCacheEntry> {
  const cached = referencesByEnvironment.get(environment);
  if (cached != null) {
    return cached;
  }
  const referencesCache = new Map();
  referencesByEnvironment.set(environment, referencesCache);
  return referencesCache;
}

function getCachedObservers(
  requestCache: Map<string, RequestCacheEntry>,
  cacheKey: string,
): Array<Observer<ExecutePayload>> {
  const cached = requestCache.get(cacheKey);
  invariant(
    cached != null,
    'fetchQuery_UNSTABLE: Expected request to be cached',
  );
  return cached.observers;
}

function addReceivedEvent(
  requestCache: Map<string, RequestCacheEntry>,
  cacheKey: string,
  observerEvent: ObserverEvent,
) {
  const cached = requestCache.get(cacheKey);
  invariant(
    cached != null,
    'fetchQuery_UNSTABLE: Expected request to be cached',
  );
  const receivedEvents = [...cached.receivedEvents, observerEvent];
  requestCache.set(cacheKey, {
    ...cached,
    receivedEvents,
  });
}

module.exports = fetchQuery_UNSTABLE;
