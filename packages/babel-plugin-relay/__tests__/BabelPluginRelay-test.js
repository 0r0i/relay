/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+relay
 */

'use strict';

require('configureForRelayOSS');

const BabelPluginRelay = require('BabelPluginRelay');

const babel = require('babel-core');
const getGoldenMatchers = require('getGoldenMatchers');
const path = require('path');

const SCHEMA_PATH = path.resolve(
  __dirname,
  '../../relay-compiler/testutils/testschema.graphql',
);
const OLD_SCHEMA_PATH = path.resolve(__dirname, './testschema.rfc.graphql');

describe('BabelPluginRelay', () => {
  beforeEach(() => {
    expect.extend(getGoldenMatchers(__filename));
  });

  // TODO(T23282195) use transformerWithOptions instead
  function transformerWithOptionsNoFilename(
    options: RelayPluginOptions,
  ): string => string {
    return text => {
      try {
        return babel.transform(text, {
          compact: false,
          parserOpts: {plugins: ['jsx']},
          plugins: [[BabelPluginRelay, options]],
        }).code;
      } catch (e) {
        return 'ERROR:\n\n' + e;
      }
    };
  }

  function transformerWithOptions(
    options: RelayPluginOptions,
  ): string => string {
    return (text, filename) => {
      try {
        return babel.transform(text, {
          compact: false,
          filename,
          parserOpts: {plugins: ['jsx']},
          plugins: [[BabelPluginRelay, options]],
        }).code;
      } catch (e) {
        return 'ERROR:\n\n' + e;
      }
    };
  }

  it('transforms source for modern core', () => {
    expect('fixtures-modern').toMatchGolden(
      transformerWithOptionsNoFilename({}),
    );
  });

  it('transforms source for compatability mode', () => {
    expect('fixtures-compat').toMatchGolden(
      transformerWithOptionsNoFilename({
        compat: true,
        schema: SCHEMA_PATH,
        substituteVariables: true,
      }),
    );
  });

  it('transforms source for modern core when using haste', () => {
    expect('fixtures-modern-haste').toMatchGolden(
      transformerWithOptionsNoFilename({
        haste: true,
      }),
    );
  });

  it('transforms source for compatability mode when using haste and custom module', () => {
    expect('fixtures-compat-haste').toMatchGolden(
      transformerWithOptionsNoFilename({
        compat: true,
        haste: true,
        schema: SCHEMA_PATH,
        substituteVariables: true,
      }),
    );
  });

  it('transforms source with classic Relay.QL tags', () => {
    expect('fixtures-classic').toMatchGolden(
      transformerWithOptions({
        schema: OLD_SCHEMA_PATH,
        substituteVariables: true,
      }),
    );
  });
});
