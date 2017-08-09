/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule RelayObservable
 * @flow
 * @format
 */

'use strict';

export type Subscription = {
  unsubscribe: () => void,
};

type Observer<T> = {
  start?: ?(Subscription) => mixed,
  next?: ?(T) => mixed,
  error?: ?(Error) => mixed,
  complete?: ?() => mixed,
};

type Sink<T> = {|
  +next: T => void,
  +error: Error => void,
  +complete: () => void,
|};

type Source_<T, SinkOfT: Sink<T>> = SinkOfT =>
  | void
  | Subscription
  | (() => mixed);
type Source<T> = Source_<T, *>;

interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription,
}

let hostReportError;

/**
 * Limited implementation of ESObservable, providing the limited set of behavior
 * Relay networking requires.
 *
 * Observables retain the benefit of callbacks which can be called
 * synchronously, avoiding any UI jitter, while providing a compositional API,
 * which simplifies logic and prevents mishandling of errors compared to
 * the direct use of callback functions.
 *
 * ESObservable: https://github.com/tc39/proposal-observable
 */
class RelayObservable<T> implements Subscribable<T> {
  _source: Source<T>;

  constructor(source: Source<T>): void {
    if (__DEV__) {
      // Early runtime errors for ill-formed sources.
      if (!source || typeof source !== 'function') {
        throw new Error('Source must be a Function: ' + String(source));
      }
    }
    this._source = source;
  }

  /**
   * When an unhandled error is detected, it is reported to the host environment
   * (the ESObservable spec refers to this method as "HostReportErrors()").
   *
   * The default implementation in development builds re-throws errors in a
   * separate frame, and from production builds does nothing (swallowing
   * uncaught errors).
   *
   * Called during application initialization, this method allows
   * application-specific handling of uncaught errors. Allowing, for example,
   * integration with error logging or developer tools.
   */
  static onUnhandledError(callback: Error => mixed): void {
    hostReportError = callback;
  }

  /**
   * Observable's primary API: returns an unsubscribable Subscription to the
   * source of this Observable.
   */
  subscribe(observer: Observer<T>): Subscription {
    if (__DEV__) {
      // Early runtime errors for ill-formed observers.
      if (!observer || typeof observer !== 'object') {
        throw new Error(
          'Observer must be an Object with callbacks: ' + String(observer),
        );
      }
    }
    return subscribe(this._source, observer);
  }
}

function handleError(error: Error): void {
  hostReportError && hostReportError(error);
}

function subscribe<T>(source: Source<T>, observer: Observer<T>): Subscription {
  let closed = false;
  let cleanup;

  function doCleanup() {
    if (cleanup) {
      if (cleanup.unsubscribe) {
        cleanup.unsubscribe();
      } else {
        try {
          cleanup();
        } catch (error) {
          handleError(error);
        }
      }
      cleanup = undefined;
    }
  }

  // Create a Subscription.
  const subscription: Subscription = {
    unsubscribe() {
      if (!closed) {
        closed = true;
        doCleanup();
      }
    },
  };

  // Tell Observer that observation is about to begin.
  try {
    observer.start && observer.start(subscription);
  } catch (error) {
    handleError(error);
  }

  // If closed already, don't bother creating a Sink.
  if (closed) {
    return subscription;
  }

  // Create a Sink respecting subscription state and cleanup.
  const sink: Sink<T> = {
    next(value) {
      if (!closed && observer.next) {
        try {
          observer.next(value);
        } catch (error) {
          handleError(error);
        }
      }
    },
    error(error) {
      try {
        if (closed) {
          throw error;
        }
        closed = true;
        if (!observer.error) {
          throw error;
        }
        observer.error(error);
      } catch (error2) {
        handleError(error2);
      } finally {
        doCleanup();
      }
    },
    complete() {
      if (!closed) {
        closed = true;
        try {
          observer.complete && observer.complete();
        } catch (error) {
          handleError(error);
        } finally {
          doCleanup();
        }
      }
    },
  };

  // If anything goes wrong during observing the source, handle the error.
  try {
    cleanup = source(sink);
  } catch (error) {
    sink.error(error);
  }

  if (__DEV__) {
    // Early runtime errors for ill-formed returned cleanup.
    if (
      cleanup !== undefined &&
      typeof cleanup !== 'function' &&
      (!cleanup || typeof cleanup.unsubscribe !== 'function')
    ) {
      throw new Error(
        'Returned cleanup function which cannot be called: ' + String(cleanup),
      );
    }
  }

  // If closed before the source function existed, cleanup now.
  if (closed) {
    doCleanup();
  }

  return subscription;
}

if (__DEV__) {
  // Default implementation of HostReportErrors() in development builds.
  // Can be replaced by the host application environment.
  RelayObservable.onUnhandledError(error => {
    if (typeof fail === 'function') {
      // In test environments (Jest), fail() immediately fails the current test.
      fail(String(error));
    } else {
      // Otherwise, rethrow on the next frame to avoid breaking current logic.
      setTimeout(() => {
        throw error;
      });
    }
  });
}

module.exports = RelayObservable;
