/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule fetchRelayStaticQuery
 * @flow
 */

'use strict';

import type {SelectorData, CacheConfig} from 'RelayCombinedEnvironmentTypes';
import type {GraphQLTaggedNode} from 'RelayStaticGraphQLTag';
import type {Variables} from 'RelayTypes';

/**
 * A helper function to fetch the results of a query. Note that results for
 * fragment spreads are masked: fields must be explicitly listed in the query in
 * order to be accessible in the result object.
 *
 * NOTE: This module is primarily intended for integrating with classic APIs.
 * Most product code should use a Renderer or Container.
 */
function fetchRelayStaticQuery(
  environment: $FlowFixMe,
  taggedNode: GraphQLTaggedNode,
  variables: Variables,
  cacheConfig?: ?CacheConfig,
): Promise<?SelectorData> {
  const {
    createOperationSelector,
    getOperation,
  } = environment.unstable_internal;
  const query = getOperation(taggedNode);
  const operation = createOperationSelector(query, variables);
  return new Promise((resolve, reject) => {
    environment.sendQuery({
      cacheConfig,
      onError: reject,
      onCompleted() {
        try {
          const snapshot = environment.lookup(operation.fragment);
          resolve(snapshot.data);
        } catch (e) {
          reject(e);
        }
      },
      operation,
    });
  });
}

module.exports = fetchRelayStaticQuery;
