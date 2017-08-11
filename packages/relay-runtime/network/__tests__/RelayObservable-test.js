/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @emails oncall+relay
 */

'use strict';

require('configureForRelayOSS');

const RelayObservable = require('RelayObservable');

jest.useFakeTimers();

describe('RelayObservable', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('Fails if not provided a source', () => {
    expect(() => new RelayObservable()).toThrow('Source must be a Function');
  });

  it('Fails if provided an incorrect source', () => {
    expect(() => new RelayObservable({})).toThrow('Source must be a Function');
  });

  describe('subscribe', () => {
    it('Fails if not provided with object', () => {
      const obs = new RelayObservable(() => {});
      expect(() => obs.subscribe()).toThrow(
        'Observer must be an Object with callbacks',
      );
      expect(() => obs.subscribe(() => {})).toThrow(
        'Observer must be an Object with callbacks',
      );
    });

    it('Handle values and complete', () => {
      const list = [];

      new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.next(3);
        sink.complete();
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', 'next:2', 'next:3', 'complete']);
    });

    it('Does not handle values after complete', () => {
      const list = [];

      new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.complete();
        sink.next(3);
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', 'next:2', 'complete']);
    });

    it('Does not handle values after handling error', () => {
      const list = [];
      const error = new Error();

      new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.error(error);
        sink.next(3);
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', 'next:2', error]);
    });

    it('Error after complete is unhandled', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(_sink => {
        sink = _sink;
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sink.next(2);
      sink.complete();

      expect(unhandledErrors).toEqual([]);
      sink.error(error);
      expect(unhandledErrors).toEqual([error]);

      expect(list).toEqual(['next:1', 'next:2', 'complete']);
    });

    it('Error is unhandled if error callback is missing', () => {
      const error = new Error('Test error');

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      const obs = new RelayObservable(sink => {
        sink.error(error);
      });

      obs.subscribe({});
      expect(unhandledErrors).toEqual([error]);
    });

    it('Calls error handle if source throws', () => {
      const list = [];
      const error = new Error();

      new RelayObservable(sink => {
        sink.next(1);
        throw error;
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', error]);
    });

    it('Error from next handler is unhandled (sync)', () => {
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.complete();
      }).subscribe({
        next: val => {
          list.push('next:' + val);
          throw error;
        },
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', 'next:2', 'complete']);
      expect(unhandledErrors).toEqual([error, error]);
    });

    it('Error from next handler is unhandled (async)', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(_sink => {
        sink = _sink;
      }).subscribe({
        next: val => {
          list.push('next:' + val);
          throw error;
        },
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);

      expect(list).toEqual(['next:1']);
      expect(unhandledErrors).toEqual([error]);

      sink.next(2);
      sink.complete();

      expect(list).toEqual(['next:1', 'next:2', 'complete']);
      expect(unhandledErrors).toEqual([error, error]);
    });

    it('Error from error handler is unhandled', () => {
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(sink => {
        sink.error(error);
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => {
          list.push(err);
          throw err;
        },
        complete: () => list.push('complete'),
      });

      expect(list).toEqual([error]);
      expect(unhandledErrors).toEqual([error]);
    });

    it('Error from complete handler is unhandled', () => {
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(sink => {
        sink.complete();
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => {
          list.push('complete');
          throw error;
        },
      });

      expect(list).toEqual(['complete']);
      expect(unhandledErrors).toEqual([error]);
    });
  });

  describe('unsubscribe', () => {
    it('Does not handle values after unsubscribe', () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
      });

      const sub = obs.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sub.unsubscribe();
      sink.next(2);

      expect(list).toEqual(['next:1']);
    });

    it('Does not handle complete after unsubscribe', () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
      });

      const sub = obs.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sub.unsubscribe();
      sink.complete();

      expect(list).toEqual(['next:1']);
    });

    it('Errors after unsubscribe are unhandled', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      const obs = new RelayObservable(_sink => {
        sink = _sink;
      });

      const sub = obs.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sub.unsubscribe();

      expect(unhandledErrors).toEqual([]);
      sink.error(error);
      expect(unhandledErrors).toEqual([error]);

      expect(list).toEqual(['next:1']);
    });
  });

  describe('cleanup', () => {
    it('Does not allow returning non-callable cleanup', () => {
      const nonCallables = [null, {}, 123, 'wat'];
      nonCallables.forEach(nonCallable => {
        const list = [];

        const obs = new RelayObservable(sink => {
          return nonCallable;
        });

        expect(() =>
          obs.subscribe({
            error: err => list.push(err),
          }),
        ).toThrow('Returned cleanup function which cannot be called');

        expect(list).toEqual([]);
      });
    });

    it('Calls cleanup after instant complete', () => {
      const list = [];

      new RelayObservable(sink => {
        sink.next(1);
        sink.complete(1);
        return () => list.push('cleanup');
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', 'complete', 'cleanup']);
    });

    it('Calls cleanup after instant error', () => {
      const list = [];
      const error = new Error();

      new RelayObservable(sink => {
        sink.next(1);
        sink.error(error);
        return () => list.push('cleanup');
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', error, 'cleanup']);
    });

    it('Calls cleanup after async complete', () => {
      let sink;
      const list = [];

      new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sink.complete(1);

      expect(list).toEqual(['next:1', 'complete', 'cleanup']);
    });

    it('Calls cleanup after async error', () => {
      let sink;
      const list = [];
      const error = new Error();

      new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sink.error(error);

      expect(list).toEqual(['next:1', error, 'cleanup']);
    });

    it('Calls cleanup after unsubscribe', () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const sub = obs.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sub.unsubscribe();

      expect(list).toEqual(['next:1', 'cleanup']);
    });

    it('Does not cleanup twice after double unsubscribe', () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const sub = obs.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sub.unsubscribe();
      sub.unsubscribe();

      expect(list).toEqual(['next:1', 'cleanup']);
    });

    it('Calls cleanup after error handler throws', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => {
          list.push(err);
          throw err;
        },
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sink.error(error);

      expect(list).toEqual(['next:1', error, 'cleanup']);
      expect(unhandledErrors).toEqual([error]);
    });

    it('Calls cleanup after complete handler throws', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => {
          list.push('complete');
          throw error;
        },
      });

      sink.next(1);
      sink.complete();

      expect(list).toEqual(['next:1', 'complete', 'cleanup']);
      expect(unhandledErrors).toEqual([error]);
    });

    it('Does not cleanup after next handler throws', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      }).subscribe({
        next: val => {
          list.push('next:' + val);
          throw error;
        },
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);

      expect(list).toEqual(['next:1']);
      expect(unhandledErrors).toEqual([error]);

      sink.next(2);

      expect(list).toEqual(['next:1', 'next:2']);
      expect(unhandledErrors).toEqual([error, error]);
    });

    it('Allows returning a Subscription as cleanup', () => {
      let sink;
      const list = [];

      const obs1 = new RelayObservable(() => {
        return () => list.push('inner-cleanup');
      });

      const obs2 = new RelayObservable(_sink => {
        sink = _sink;
        return obs1.subscribe({});
      });

      const sub = obs2.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sub.unsubscribe();

      expect(list).toEqual(['next:1', 'inner-cleanup']);
    });

    it('Cleanup errors are unhandled', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(_sink => {
        sink = _sink;
        return () => {
          list.push('cleanup');
          throw error;
        };
      }).subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      sink.next(1);
      sink.complete();

      expect(list).toEqual(['next:1', 'complete', 'cleanup']);
      expect(unhandledErrors).toEqual([error]);
    });
  });

  describe('start', () => {
    it('Is called before source', () => {
      const list = [];
      let startSub;
      let startThis;

      const obs = new RelayObservable(sink => {
        list.push('enter source');
        sink.next(1);
        sink.complete();
        list.push('exit source');
      });

      const observer = {
        start(subscription) {
          list.push('start');
          startSub = subscription;
          // eslint-disable-next-line consistent-this
          startThis = this;
        },
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      };

      const sub = obs.subscribe(observer);

      expect(startSub).toBe(sub);
      expect(startThis).toBe(observer);

      expect(list).toEqual([
        'start',
        'enter source',
        'next:1',
        'complete',
        'exit source',
      ]);
    });

    it('Can unsubscribe before source', () => {
      const list = [];

      new RelayObservable(sink => {
        list.push('enter source');
        sink.next(1);
        sink.complete();
        list.push('exit source');
      }).subscribe({
        start: subscription => {
          list.push('start');
          subscription.unsubscribe();
        },
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['start']);
    });

    it('Error from start handler is unhandled', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      }).subscribe({
        start: () => {
          list.push('start');
          throw error;
        },
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(unhandledErrors).toEqual([error]);

      sink.complete();
      expect(list).toEqual(['start', 'complete', 'cleanup']);
    });
  });

  describe('map', () => {
    it('Maps values from the original observable', () => {
      const source = new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.next(3);
        sink.complete();
      });

      const mapped = source.map(v => v * 2 + 1);

      const list = [];
      mapped.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:3', 'next:5', 'next:7', 'complete']);
    });

    it('Does not map errors from the original observable', () => {
      const list = [];
      const error = new Error();

      const source = new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.error(error);
        sink.next(3);
      });

      const mapped = source.map(v => v * 2 + 1);

      mapped.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:3', 'next:5', error]);
    });

    it('Calls error handler and cleans up if map function throws', () => {
      const list = [];
      const error = new Error();

      const source = new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.next(3);
        return () => list.push('cleanup');
      });

      const mapped = source.map(v => {
        if (v === 2) {
          throw error;
        }
        return v * 2 + 1;
      });

      mapped.subscribe({
        next: val => list.push('next:' + val),
        error: err => list.push(err),
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['next:3', error, 'cleanup']);
    });

    it('Error thrown from mapper and no error handler is unhandled', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      const source = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const mapped = source.map(v => {
        if (v === 2) {
          throw error;
        }
        return v * 2 + 1;
      });

      mapped.subscribe({
        next: val => list.push('next:' + val),
      });

      sink.next(1);
      expect(unhandledErrors).toEqual([]);

      sink.next(2);
      expect(unhandledErrors).toEqual([error]);

      expect(list).toEqual(['next:3', 'cleanup']);
    });

    it('Does not call error handler if next handler throws', () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      const source = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const mapped = source.map(v => v * 2 + 1);

      mapped.subscribe({
        next: val => {
          list.push('next:' + val);
          if (val === 5) {
            throw error;
          }
        },
        error: err => list.push(err),
      });

      sink.next(1);
      expect(unhandledErrors).toEqual([]);

      sink.next(2);
      expect(unhandledErrors).toEqual([error]);

      sink.next(3);
      expect(list).toEqual(['next:3', 'next:5', 'next:7']);
    });
  });

  describe('from', () => {
    it('Converts a resolved Promise to an Observable', async () => {
      const list = [];
      const value = {key: 'value'};

      const promise = Promise.resolve(value);
      const obs = RelayObservable.from(promise);

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      // Promise does not resolve callbacks synchronously.
      expect(list).toEqual([]);
      await promise;
      expect(list).toEqual([value, 'complete']);
    });

    it('Converts a rejected Promise to an Observable', async () => {
      const list = [];
      const error = new Error();

      const promise = Promise.reject(error);
      const obs = RelayObservable.from(promise);

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      // Promise does not resolve callbacks synchronously.
      expect(list).toEqual([]);
      await promise.catch(() => {});
      expect(list).toEqual(['error', error]);
    });

    it('Error in next handler is unhandled', async () => {
      const list = [];
      const error = new Error();
      const value = {key: 'value'};

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      const promise = Promise.resolve(value);
      const obs = RelayObservable.from(promise);

      obs.subscribe({
        next: val => {
          list.push(val);
          throw error;
        },
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      // Promise does not resolve callbacks synchronously.
      expect(list).toEqual([]);
      await promise;
      expect(list).toEqual([value, 'complete']);

      expect(unhandledErrors).toEqual([error]);
    });

    it('Directly returns RelayObservable instance', () => {
      const obs1 = new RelayObservable(() => {});
      const obs2 = RelayObservable.from(obs1);

      expect(obs2).toBe(obs1);
    });

    it('Subscribes to Observable from another library', () => {
      const list = [];

      const fauxObservable = {
        subscribe(callbacks) {
          callbacks.next(1);
          callbacks.next(2);
          callbacks.complete();
          return {
            unsubscribe() {
              list.push('unsubscribed');
            },
          };
        },
      };

      const obs = RelayObservable.from(fauxObservable);

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      expect(list).toEqual([1, 2, 'complete', 'unsubscribed']);
    });

    it('Converts a plain value to an Observable', () => {
      const list = [];
      const value = {key: 'value'};

      const obs = RelayObservable.from(value);

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      expect(list).toEqual([value, 'complete']);
    });

    it('Converts an Error instance to an Observable', () => {
      const list = [];
      const error = new Error();

      const obs = RelayObservable.from(error);

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['error', error]);
    });
  });

  describe('fromLegacy', () => {
    it('Converts a legacy Relay observe API into an Observable', () => {
      const list = [];

      function exampleLegacyAPI(one, two, observer) {
        observer.onNext(one);
        observer.onNext(two);
        observer.onCompleted();
        return {
          dispose() {
            list.push('dispose');
          },
        };
      }

      const obs = RelayObservable.fromLegacy(observer =>
        exampleLegacyAPI('one', 'two', observer),
      );

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['one', 'two', 'complete', 'dispose']);
    });

    it('Allows unsubscribing from a legacy Relay API', () => {
      const list = [];

      function exampleLegacyAPI(one, two, observer) {
        observer.onNext(one);
        observer.onNext(two);
        return {
          prop: 'property',
          dispose() {
            list.push('dispose:' + this.prop);
          },
        };
      }

      const obs = RelayObservable.fromLegacy(observer =>
        exampleLegacyAPI('one', 'two', observer),
      );

      const sub = obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      sub.unsubscribe();

      expect(list).toEqual(['one', 'two', 'dispose:property']);
    });

    it('Errors thrown in legacy API are handled', () => {
      const list = [];
      const error = new Error();

      function exampleLegacyAPI(one, two, observer) {
        observer.onNext(one);
        throw error;
      }

      const obs = RelayObservable.fromLegacy(observer =>
        exampleLegacyAPI('one', 'two', observer),
      );

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['one', 'error', error]);
    });

    it('Supports legacy API which now return Observable', () => {
      const list = [];

      function exampleLegacyAPI(one, two, observer) {
        const fauxObservable = {
          subscribe(callbacks) {
            callbacks.next(one);
            callbacks.next(two);
            callbacks.complete();
            return {
              unsubscribe() {
                list.push('unsubscribed');
              },
            };
          },
        };
        return fauxObservable;
      }

      const obs = RelayObservable.fromLegacy(observer =>
        exampleLegacyAPI('one', 'two', observer),
      );

      obs.subscribe({
        next: val => list.push(val),
        error: err => {
          list.push('error');
          list.push(err);
        },
        complete: () => list.push('complete'),
      });

      expect(list).toEqual(['one', 'two', 'complete', 'unsubscribed']);
    });
  });

  describe('subscribeLegacy', () => {
    it('Handle values and complete', () => {
      const list = [];

      new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.next(3);
        sink.complete();
      }).subscribeLegacy({
        onNext: val => list.push('next:' + val),
        onError: err => list.push(err),
        onCompleted: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', 'next:2', 'next:3', 'complete']);
    });

    it('Does not handle values after handling error', () => {
      const list = [];
      const error = new Error();

      new RelayObservable(sink => {
        sink.next(1);
        sink.next(2);
        sink.error(error);
        sink.next(3);
      }).subscribeLegacy({
        onNext: val => list.push('next:' + val),
        onError: err => list.push(err),
        onCompleted: () => list.push('complete'),
      });

      expect(list).toEqual(['next:1', 'next:2', error]);
    });

    it('Cleans up and does not handle values after dispose', () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const disposable = obs.subscribeLegacy({
        onNext: val => list.push('next:' + val),
        onError: err => list.push(err),
        onCompleted: () => list.push('complete'),
      });

      sink.next(1);
      disposable.dispose();
      sink.next(2);

      expect(list).toEqual(['next:1', 'cleanup']);
    });
  });

  describe('poll', () => {
    it('Throws error if polling interval is too small', () => {
      expect(() => new RelayObservable(() => {}).poll(0)).toThrow(
        'Expected pollInterval to be positive',
      );

      expect(() => new RelayObservable(() => {}).poll(-1)).toThrow(
        'Expected pollInterval to be positive',
      );

      expect(() => new RelayObservable(() => {}).poll('3')).toThrow(
        'Expected pollInterval to be positive',
      );

      expect(() => new RelayObservable(() => {}).poll({})).toThrow(
        'Expected pollInterval to be positive',
      );
    });

    it('Repeatedly observes and subscribes', () => {
      let sink;
      const list = [];
      const obs = new RelayObservable(_sink => {
        list.push('start');
        sink = _sink;
        return () => list.push('cleanup');
      }).poll(1);

      const sub = obs.subscribe({
        next: val => list.push(val),
        complete: () => list.push('complete'),
      });

      sink.next('one');
      expect(list).toEqual(['start', 'one']);

      sink.complete();
      expect(list).toEqual(['start', 'one', 'cleanup']);

      const sink1 = sink;
      jest.runAllTimers(); // advance to next poll
      expect(sink).not.toBe(sink1);
      expect(list).toEqual(['start', 'one', 'cleanup', 'start']);

      sink.next('again');
      expect(list).toEqual(['start', 'one', 'cleanup', 'start', 'again']);

      jest.runAllTimers(); // does nothing since previous was not completed.
      expect(list).toEqual(['start', 'one', 'cleanup', 'start', 'again']);

      sink.complete();
      expect(list).toEqual([
        'start',
        'one',
        'cleanup',
        'start',
        'again',
        'cleanup',
      ]);

      sub.unsubscribe(); // does not call cleanup twice.
      expect(list).toEqual([
        'start',
        'one',
        'cleanup',
        'start',
        'again',
        'cleanup',
      ]);

      jest.runAllTimers(); // does nothing since unsubscribed.
      expect(list).toEqual([
        'start',
        'one',
        'cleanup',
        'start',
        'again',
        'cleanup',
      ]);
    });

    it('Cleans up after unsubscribe', () => {
      let sink;
      const list = [];
      const obs = new RelayObservable(_sink => {
        list.push('start');
        sink = _sink;
        return () => list.push('cleanup');
      }).poll(1);

      const sub = obs.subscribe({
        next: val => list.push(val),
        complete: () => list.push('complete'),
      });

      sink.next('one');
      expect(list).toEqual(['start', 'one']);

      sub.unsubscribe(); // does not call cleanup twice.
      expect(list).toEqual(['start', 'one', 'cleanup']);

      jest.runAllTimers(); // does nothing since unsubscribed.
      expect(list).toEqual(['start', 'one', 'cleanup']);
    });
  });

  describe('toPromise', () => {
    it('Converts an Observable into a Promise', async () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const promise = obs.toPromise();

      sink.next(1);
      sink.complete(1);

      await promise.then(
        val => list.push('resolve:' + val),
        err => list.push(err),
      );

      // Due to Promise resolving at the end of the frame, cleanup occurs first.
      expect(list).toEqual(['cleanup', 'resolve:1']);
    });

    it('Rejects Promise if error during source', async () => {
      const list = [];
      const error = new Error();

      const obs = new RelayObservable(sink => {
        throw error;
      });

      const promise = obs.toPromise();

      await promise.then(
        val => list.push('resolve:' + val),
        err => list.push(err),
      );

      // Due to Promise resolving at the end of the frame, cleanup occurs first.
      expect(list).toEqual([error]);
    });

    it('Errors during cleanup are unhandled (sync)', async () => {
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      const obs = new RelayObservable(sink => {
        sink.next(1);
        sink.complete();
        return () => {
          throw error;
        };
      });

      const promise = obs.toPromise();

      await promise.then(
        val => list.push('resolve:' + val),
        err => list.push(err),
      );

      expect(list).toEqual(['resolve:1']);
      expect(unhandledErrors).toEqual([error]);
    });

    it('Errors during cleanup are unhandled (async)', async () => {
      let sink;
      const list = [];
      const error = new Error();

      const unhandledErrors = [];
      RelayObservable.onUnhandledError(err => {
        unhandledErrors.push(err);
      });

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => {
          throw error;
        };
      });

      const promise = obs.toPromise();

      sink.next(1);
      sink.complete();

      await promise.then(
        val => list.push('resolve:' + val),
        err => list.push(err),
      );

      expect(list).toEqual(['resolve:1']);
      expect(unhandledErrors).toEqual([error]);
    });

    it('Only resolves the last yielded value', async () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const promise = obs.toPromise();

      sink.next(1);
      sink.next(2);
      sink.next(3);
      sink.complete();

      await promise.then(
        val => list.push('resolve:' + val),
        err => list.push(err),
      );

      expect(list).toEqual(['cleanup', 'resolve:3']);
    });

    it('Converts an Observable error into a rejected Promise', async () => {
      let sink;
      const list = [];
      const error = new Error();

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const promise = obs.toPromise();

      sink.error(error);
      await promise.then(
        val => list.push('resolve:' + val),
        err => list.push(err),
      );

      // Due to Promise resolving at the end of the frame, cleanup occurs first.
      expect(list).toEqual(['cleanup', error]);
    });

    it('Converts an Observable complete into a resolved Promise', async () => {
      let sink;
      const list = [];

      const obs = new RelayObservable(_sink => {
        sink = _sink;
        return () => list.push('cleanup');
      });

      const promise = obs.toPromise();

      sink.complete();
      await promise.then(
        val => list.push('resolve:' + val),
        err => list.push(err),
      );

      // Due to Promise resolving at the end of the frame, cleanup occurs first.
      expect(list).toEqual(['cleanup', 'resolve:undefined']);
    });

    it('Is the dual to from(Promise)', async () => {
      const value = {};
      const error = new Error();

      const resolved = RelayObservable.from(Promise.resolve(value)).toPromise();
      const rejected = RelayObservable.from(Promise.reject(error)).toPromise();

      expect(await resolved).toBe(value);
      expect(await rejected.catch(e => e)).toBe(error);
    });
  });
});
