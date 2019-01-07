#!/usr/bin/env node

'use strict';
// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

const {ArgumentParser} = require('argparse');
const parser = new ArgumentParser();

parser.addArgument(
  [ 'script' ], {
    help: 'script to run',
    type: 'string',
  },
);

const args = parser.parseArgs();

if (args.script === 'build' || args.script === 'build-server') {
  // Do this as the first thing so that any code reading it knows the right env.
  process.env.BABEL_ENV = 'production';
  process.env.NODE_ENV = 'production';
} else {
  process.env.NODE_ENV = process.env.NODE_ENV || "development";
}

/**
 * We know what packages are included in react-scripts, 
 * to avoid using different packages,
 * require these modules as we were in react-scripts package
 * @param {string} name 
 */
function requirePeer(name) {
  return require(require.resolve(name), {paths: require.resolve('react-scripts/package.json')});
}

const {cloneDeepWith: visitor} = require('lodash');
const babelPresetReactApp = require('babel-preset-react-app');
const chalk = require('chalk');
const fs = require('fs-extra');
const LoadablePlugin = require('@loadable/webpack-plugin');
const path = require('path');
const paths = require('react-scripts/config/paths');
const pify = require('pify');
const ReactIntlExtractWebpackPlugin = require('@react-app/react-intl-extract-webpack-plugin');
const TerserPlugin = requirePeer('terser-webpack-plugin');
const WatcherWebpackPlugin = require('@react-app/watcher-webpack-plugin');
const webpack = requirePeer('webpack');
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');

const {name, version} = require('./package.json');
const isEnvDevelopment = process.env.NODE_ENV === 'development';
const isEnvProduction = process.env.NODE_ENV === 'production';
const isEsmodules = process.env.ESMODULES && true;


/**
 * Helper function to further modify 'babel-preset-react-app'
 * @param {array} modifiers
 * @returns {function} preset
 */
function babelPreset(...modifiers) {
  return (...args) => {
    return modifiers.reduce((preset, modifier) => modifier(preset), babelPresetReactApp(...args));
  } 
}

/**
 * Sets targets: 'esmodules'
 * @param {object} preset 
 * @returns {object} preset
 */
function babelPresetEsmodulesModifer(preset) {
  visitor(preset.presets, (value) => {
    if (value instanceof Array) {
        if (value.length > 1 && value[1] instanceof Object && value[1].targets) {
            if (!value[1].targets.node) {
                value[1].targets = {
                    esmodules: true,
                };
            }
        }
    }
  });

  return preset;
}
/**
 * Adds 'babel-plugin-dynamic-import-node' to preset's plugins
 * @param {object} preset 
 * @returns {object} preset
 */
function babelPresetDynamicImportNode(preset) {
  preset.plugins.push('babel-plugin-dynamic-import-node');
  return preset;
}

/**
 * Sets preset sourceType to unambiguous
 * @param {object} preset 
 * @returns {object} preset
 */
function babelPresetSourceTypeUnambiguousModifer(preset) {
  preset.sourceType = 'unambiguous';
  return preset;
}

/**
 * Disables clearing of console
 */
function disableClearConsole() {
  require('react-dev-utils/clearConsole');
  require.cache[require.resolve('react-dev-utils/clearConsole')].exports = function() {}
}

/**
 * Will make console.warn log messages yellow for better readibility
 */
function colorizeWarnings() {
  if (process.stdout.isTTY) {

    const warn = console.warn;
    console.warn = function(msg, ...args) {
      warn.call(console, chalk.yellow(msg), ...args);
    };
  }
}

function ensureIfPresent(str, data) {
  if (data.indexOf(str) === -1) {
   return `${data}\n${str}`;
  }

  return data;
}
  
/**
 * Generate definitions file react-app-env-ext.d.ts in src folder if they don't exist
 */
function checkDefinitions() {
  const envDefinitionsFile = path.join(process.cwd(), 'src', 'react-app-env.d.ts');

  let data = '';

  if (fs.existsSync(envDefinitionsFile)) {
    data = fs.readFileSync(envDefinitionsFile, 'utf-8');
  }

  data = ensureIfPresent(`/// <reference types="@react-app/react-scripts" />`, data);
  data = ensureIfPresent(`/// <reference types="webpack-env" />`, data);

  fs.writeFileSync(envDefinitionsFile, data);
}

/**
 * Unlinks (removes) file if it exists
 * @param {string} filename
 * @returns {Promise}
 */
function unlinkIfExists(filename) {
  return pify(fs.exists, {errorFirst: false})(filename)
      .then(exists => {
        if (exists) {
            return pify(fs.unlink)(filename);
        }

        return null;
      });
}

function addPaths(paths) {
  Object.assign(paths, {
    bin: path.join(paths.appPath, 'bin'),
  });

  Object.assign(paths, {
    serverBuild: path.join(paths.bin, 'server'),
  });
}

/**
 * Adds in-place extensions to webpack config 
 * @param {object} config webpack's config to modify 
 */
function addExtensions(config, isTargetNode = false) {

  visitor(config.module.rules, (rule => {
    if (rule instanceof Object) {

      // modify eslint loader to use .eslintignore
      if (rule.loader && (typeof rule.loader === 'string') && rule.loader.indexOf('eslint') > -1) {
        delete rule.options.ignore;

        if (isTargetNode) {
          // disable eslint on node to speedup compilation
          rule.loader = require.resolve('./noop-loader');
        }
      }
  
      if (rule.hasOwnProperty('oneOf')) {
        // add support for graphql
        rule.oneOf.unshift({
          test: /\.(graphql|gql)$/,
          exclude: /node_modules/,
          use: [
            'graphql-tag/loader',
            !isTargetNode && '@react-app/graphql-typings-loader',
          ].filter(Boolean),
        });
      } else if (rule.test) {
        // modify mjs, js[x], ts[x]
        if (`${rule.test}`.indexOf('js') > -1) {
          if (rule.include === paths.appSrc) {
            // modify loaders for src

            // add babel plugins
            visitor(rule, ({loader, options}) => {
              if (loader && loader.indexOf('babel-loader') > -1) {

                if (!isTargetNode) {
                  // add support for react-hot-loader
                  options.plugins.push('react-hot-loader/babel');
                }

                // add support for loadable components 
                options.plugins.push('@loadable/babel-plugin');

                // add support for responsive images generation
                visitor(options.plugins, (plugin) => {
                  if (plugin instanceof Object && plugin.loaderMap) {
                    ['png', 'jpg', 'bmp', 'jpeg'].forEach(ext => {
                      plugin.loaderMap[ext] = {
                        responsiveImage: `!!@react-app/responsive-image-loader![path]`,
                      }
                    });
                  }
                })

                const presetModifiers = [];

                // add support for es6 build
                if (isEsmodules) {
                  presetModifiers.push(babelPresetEsmodulesModifer);
                  options.cacheIdentifier += `:${name}-esmodules@${version}`;
                }

                if (isTargetNode) {
                  presetModifiers.push(babelPresetDynamicImportNode);
                  options.cacheIdentifier += `:node`;

                } else {
                  // add support for react-intl
                  options.plugins.push('@react-app/react-intl-extract-webpack-plugin/babel');
                  if (!options.metadataSubscribers) {
                    options.metadataSubscribers = [];
                  }
                  options.metadataSubscribers.push(ReactIntlExtractWebpackPlugin.BABEL_LOADER_METADATA_SUBSCRIBER)
                }

                if (presetModifiers.length) {
                  options.presets = [babelPreset(...presetModifiers)];
                }
              }
            });
          }
        }

        // modify modules.[s]css
        if (`${rule.test}`.indexOf('css') > -1 && `${rule.test}`.indexOf('module') > -1) {
            const use =  rule.use || rule.loader;
          
            let index = use.findIndex(item =>
              (typeof item === 'string' && item.indexOf('css-loader') > -1) ||
                (item instanceof Object && item.loader && item.loader.indexOf('css-loader') > -1));
      
            if (index === undefined) {
              console.log(`Could not modify ${rule.test}, css-loader definition not found.`);
              process.exit(1);
            }

            if (!isTargetNode) {
              use.splice(index++, 0, '@react-app/css-modules-modify-specificity-loader');
              use.splice(index++, 0, '@react-app/css-modules-fix-local-keyframes-loader');
              use.splice(index++, 0, '@react-app/css-modules-typings-loader');
            } else {
              use.splice(0, index);

              if (typeof use[0] === 'string') {
                use[0] = 'css-loader/locals';
              } else if (use[0] instanceof Object) {
                const cssLoader = use[0]; 
                cssLoader.loader = 'css-loader/locals';
              }
            }
        }
      }
    }
  }));

  if (!isTargetNode) {
    // add Loadable Components plugin
    config.plugins.push(new LoadablePlugin({filename: isEsmodules ? 'loadable-stats-esmodules.json' : 'loadable-stats.json'}));
    
    // add watcher plugin for better developer experience
    if (isEnvDevelopment) {
      config.plugins.push(new WatcherWebpackPlugin('src/**/*.(module.css|graphql)' ,{
          onRemove: (file) => Promise.all([
            unlinkIfExists(`${file}.d.ts`),
            unlinkIfExists(`${file}.types.ts`),
          ]),
      }));
    }

    config.plugins.push(new ReactIntlExtractWebpackPlugin({suffix: isEsmodules ? 'esmodules' : ''}));
  }

  // add support for es6 builds
  if (isEsmodules) {
    visitor(config.optimization.minimizer, (value => {
      if (value instanceof TerserPlugin) {
        visitor(value.options, option => {
          if (option instanceof Object) {
            if (option.compress) {
              option.compress.ecma = 6;
            }
    
            if (option.output) {
              option.output.ecma = 6;
            }
          }
        });
      }
    }));
  }

  // modify alias and add support for dynamic aliasing through NormalModuleReplacementPlugin
  try {
    const aliasConfig = require(path.join(process.cwd(), '.alias'));
    const replacers = [];

    const alias = Object.keys(aliasConfig).reduce((obj, key) => {
      const val = aliasConfig[key];

      if (val instanceof Function) {
        replacers.push(val);
      } else {
        obj[key] = val;
      }

      return obj;

    }, {});

    config.resolve.alias = {
      ...config.resolve.alias,
      ...alias,
    };

    if (replacers.length) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/.*/, result => {
        for (const replacer of replacers) {
          const request = replacer(result.request);
          if (request) {
            result.request = request;

            if (result.resource) {
              result.resource = replacer(result.resource);
            }

            break;
          }
        }
      }));
    }
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      throw e;
    }
  }
  
  // we want to transpile typescript from sources even in node_modules so we shift it to the first place
  config.resolve.extensions.unshift(".tsx", ".ts");

  if (isTargetNode) {
    config.entry = path.join(paths.appSrc, 'server');
    config.output.filename = 'middleware.js';
    
    if (isEnvProduction) {
      config.output.path = paths.serverBuild;
    }
    
    config.externals = config.externals || [];
    config.externals.push(/@loadable/);

    config.output.libraryTarget = 'commonjs2';
    config.output.chunkFilename = '[name].chunk.js';
    config.target = 'node';
    config.optimization.minimize = false;
    config.optimization.splitChunks = false;
    config.optimization.runtimeChunk = false;

    config.plugins = config.plugins.filter(plugin => plugin instanceof webpack.DefinePlugin);
    config.plugins.push(
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    );
  }
}

function buildServer(config) {
  fs.emptyDirSync(paths.serverBuild);
  fs.copyFileSync(path.join(__dirname, 'bin', 'server.js'), path.join(paths.serverBuild, 'index.js'));
  
  return new Promise((resolve, reject) => {
      webpack(config, (err, stats) => {
        let messages;
  
        if (err) {
          if (!err.message) {
            return reject(err);
          }
          messages = formatWebpackMessages({
            errors: [err.message],
            warnings: [],
          });
        } else {
          messages = formatWebpackMessages(
            stats.toJson({ all: false, warnings: true, errors: true })
          );
        }
        if (messages.errors.length) {
          // Only keep the first error. Others are often indicative
          // of the same problem, but confuse the reader with noise.
          if (messages.errors.length > 1) {
            messages.errors.length = 1;
          }
          return reject(new Error(messages.errors.join('\n\n')));
        }
        if (
          process.env.CI &&
          (typeof process.env.CI !== 'string' ||
            process.env.CI.toLowerCase() !== 'false') &&
          messages.warnings.length
        ) {
          console.log(
            chalk.yellow(
              '\nTreating warnings as errors because process.env.CI = true.\n' +
              'Most CI servers set it automatically.\n'
            )
          );
          return reject(new Error(messages.warnings.join('\n\n')));
        }
  
        resolve();
      });
    });
}

// Main
addPaths(paths);
disableClearConsole();
colorizeWarnings();
checkDefinitions();

let config;

if (isEnvDevelopment) {
  config = require('react-scripts/config/webpack.config.dev');
}

if (isEnvProduction) {
  config = require('react-scripts/config/webpack.config.prod');
}

if (args.script === 'start-server') {
  addExtensions(config, true);
  const {watch} = require('@react-app/ssr-webpack-dev-server');
  watch(config);
} else if (args.script === 'build-server') {
  addExtensions(config, true);
  buildServer(config);

} else {
  addExtensions(config);
  require(`react-scripts/scripts/${args.script}`);
}


