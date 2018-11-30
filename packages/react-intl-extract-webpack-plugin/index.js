const {getHashDigest} = require('loader-utils');
const {RawSource, Source} = require('webpack-sources');
const webpack = require('webpack');
const path = require('path');
const {
    Template,
} = webpack;

const IDENTIFIER = 'react-intl-extract-webpack-plugin';
const TRANSLATIONS_MODULE_FILENAME = 'translations';
const WEBPACK_REQUIRE_REGEX = /function.*\(.*__webpack_require__.*/;

class ReactIntlExtractWebpackPlugin {
    constructor(options = {}) {
        this.options = {
            development: process.env.NODE_ENV === 'development',
            outputPath: 'static/intl/',
            ...options,
        };

        this.translations = {};
        
        // these structures should be slightly faster than standard objects and arrays
        this.moduleDescriptorIds = new WeakMap();
        this.descriptors = new Map();
        this.initialChunkGroupNames = new Set();
    }

    /**
     * Generates asset path, only computes hashes during production
     * @param {string} name 
     * @param {string} content 
     */
    assetPath(name, content) {
        return `${this.options.outputPath}${name.replace(/\.\[hash\]/, this.options.development ? '' : '.' + getHashDigest(content))}`;
    }

    apply(compiler) {
        compiler.hooks.thisCompilation.tap(IDENTIFIER, (compilation) => {
            // clear previously collected translation descriptors
            // useful when watching when we process only translations which dependencies have changed
            this.descriptors.clear();

            // try to (re)load project's translations function which loads required translations during build
            const translationsModuleFilename = path.join(process.cwd(), TRANSLATIONS_MODULE_FILENAME);
            try {
                this.loadTranslations = require(translationsModuleFilename);
            } catch (e) {
                compilation.warnings.push(`[${IDENTIFIER}]: Could not import translations load function. Make sure that '${translationsModuleFilename}' file exists.`) 
                this.loadTranslations = () => Promise.resolve();
            }
            
            // add metadata subscriber function to module's loader context
            // react intl babel plugin saves it's output using babel's metadata feature
            // and this is the way to access it
            // more info here: https://github.com/webpack/webpack/issues/2564
            compilation.hooks.normalModuleLoader.tap(IDENTIFIER, (context, mod) => {
                context[IDENTIFIER] = ({['react-intl']: metadata = {}} = {}) => {                    
                    const {messages: descriptors} = metadata;

                    if (descriptors && descriptors.length) {
                        const ids = [];
                        
                        descriptors.forEach(descriptor => {
                            ids.push(descriptor.id);
                            this.descriptors.set(descriptor.id, descriptor);
                        });

                        this.moduleDescriptorIds.set(mod, ids);
                    }
                };
            });
            
            // we need to load translations with promise, so this is it the only logical hook to do so
            compilation.hooks.optimizeTree.tapPromise(IDENTIFIER, () => {
                // load translations that were needed in this compilation phase
                return this.loadTranslations(this.descriptors.values())
                    .then(loadedTranslations => {
                        Object.assign(this.translations, loadedTranslations);
                    })
                    .catch(error => {
                        // this should be done by webpack itself, but it isn't, posted an issue
                        // https://github.com/webpack/webpack/issues/8446
                        compilation.errors.push(error);
                    });
            });

            // everything should be optimized and have its final id and name
            compilation.hooks.afterHash.tap(IDENTIFIER, () => {
                // webpack has zero documentation about how these things work
                // so I did my best from reading the sources of its various plugins and webpack itself
                // compilations consists of chunk groups and chunk group consist of chunks and chunks consist of modules
                // every chunk group has its own name and it is our main reference 
                
                
                // we will need to load these chunk groups when bootstrapping the app 
                this.initialChunkGroupNames.clear();
                // store map of chunkId to chunkGroupName
                this.chunkIdChunkGroupName = {};
                
                // store descriptor ids per chunk group
                const chunkGroupIds = new Map();

                // detect translation descriptor ids per chunkGroup
                // make needed mappings so we don't need to traverse these later again 
                for (const chunkGroup of compilation.chunkGroups) {
                    if (chunkGroup.isInitial()) {
                        this.initialChunkGroupNames.add(chunkGroup.name);
                    }

                    for (const chunk of chunkGroup.chunks) {
                        let has = false;

                        for (const mod of chunk.getModules()) {
                            const ids = this.moduleDescriptorIds.get(mod);

                            if (ids) {
                                chunkGroupIds.set(chunkGroup, ids);
                                has = true;
                            }
                        }

                        if (has) {
                            // we build everything around chunkGroup.name
                            // but the code in template (in hook below) uses chunkId (chunk.id) during require ensure (that's webpack name for what is used when import() is called)
                            // chunk.id can be different from chunkGroup.name
                            // I assume chunk.name == chunkGroup.name
                            // so this map stores mapping which we can use later
                            this.chunkIdChunkGroupName[chunk.id] = chunk.name;
                        }
                    }
                }
                const {translations} = this;

                // manifest of {[chunkGroupName]: {[locale]: asset}} for each chunkGroup.name
                this.manifest = {};
                // assets storage to use in hook later
                this.assets = {};
                
                // all messages per locale (useful for SSR)
                const messages = {};

                // messages per chunkGroup per locale
                const chunkGroupNameMessages = {};
                
                // sort messages per chunkGroup per locale 
                chunkGroupIds.forEach((ids, chunkGroup) => {
                    chunkGroupNameMessages[chunkGroup.name] = {};

                    ids.forEach(id => {
                        const translation = translations[id];

                        if (translation) {
                            Object.keys(translation).forEach(locale => {
                                if (!messages[locale]) {
                                    messages[locale] = {};
                                }
                                messages[locale][id] = translation[locale];

                                if (!chunkGroupNameMessages[chunkGroup.name][locale]) {
                                    chunkGroupNameMessages[chunkGroup.name][locale] = {};   
                                }
                                
                                chunkGroupNameMessages[chunkGroup.name][locale][id] = translation[locale];
                            });
                        }
                    });
                });


                // create assets and manifest
                Object.keys(chunkGroupNameMessages).forEach((chunkGroupName) => {
                    const chunkGroupTranslations = chunkGroupNameMessages[chunkGroupName];

                    Object.keys(chunkGroupTranslations).forEach(locale => {
                        const chunkGroupLocaleTranslations = JSON.stringify(chunkGroupTranslations[locale]);

                        if (chunkGroupLocaleTranslations) {
                            if (!this.manifest[chunkGroupName]) {
                                this.manifest[chunkGroupName] = {};
                            }

                            // naming taken from create-react-app 
                            // TODO: could be modified with options in the future
                            const filename = this.assetPath(`${chunkGroupName}.[hash].chunk.${locale}.json`, chunkGroupLocaleTranslations);
                            this.manifest[chunkGroupName][locale] = `/${filename}`;
                            this.assets[filename] = chunkGroupLocaleTranslations;
                        }
                    });
                });

                // add messages to assets
                let json = JSON.stringify(messages);
                this.assets[this.assetPath(`react-intl-messages.[hash].json`, json)] = json;

                json = JSON.stringify(chunkGroupNameMessages);
                this.assets[this.assetPath(`react-intl-chunkgroup-messages.[hash].json`, json)] = json;
            });

            const { mainTemplate, hotUpdateChunkTemplate } = compilation;


            // read the webpack source for more info: MainTemplate.js
            mainTemplate.hooks.localVars.tap(IDENTIFIER, (source) => {
                let args = []; 

                this.initialChunkGroupNames.forEach(name => {
                    if (typeof name === 'string') {
                        args.push(`"${name}"`);
                    } else {
                        args.push(name);
                    }
                });

                // store our things in __webpack_require__ function which reference is shared everywhere
                // if someone understands webpack better, feel free to rewrite it with uses of webpack.Dependency and ModuleFactory like in mini-css-extract plugin 
                // I had to stop reading that source code, it was a mess
        
                // intlChunkLoader acts as an array, which will be enhanced from client's userland

                return Template.asString([
                    source,
                    '',
                    '// localVars',
                    `__webpack_require__.intlChunkIdManifest = ${JSON.stringify(this.chunkIdChunkGroupName)};`,
                    `__webpack_require__.intlManifest = ${JSON.stringify(this.manifest)};`,
                    `__webpack_require__.intlChunkLoader = __webpack_require__.intlChunkLoader || [];`,
                    args.length ? `__webpack_require__.intlChunkLoader.push(${args.join(',')});` : '',
                ]);
            });

            mainTemplate.hooks.requireEnsure.tap(IDENTIFIER,
                (source) => {
                    // ads a promise to import() promises, you can get more context from webpack source
                    return Template.asString([
                        source,
                        `if (__webpack_require__.intlChunkIdManifest[chunkId]) {promises.push(Promise.resolve(__webpack_require__.intlChunkLoader.push(__webpack_require__.intlChunkIdManifest[chunkId])));}`
                    ]);
            });

            // hot reloading code
            hotUpdateChunkTemplate.hooks.modules.tap(IDENTIFIER, (source) => {
                const hotMessages = {};

                for (const id of this.descriptors.keys()) {
                    const translation = this.translations[id];

                    if (translation) {
                        Object.keys(translation).forEach(locale => {
                            if (!hotMessages[locale]) {
                                hotMessages[locale] = {};
                            }

                            hotMessages[locale][id] = translation[locale];
                        });
                    }
                };

                let index;


                // TODO: rewrite this with more bulletproof code
                for (let i = 0; i < source.children.length; i++) {
                    let string;

                    const stringOrSource = source.children[i];

                    if (typeof stringOrSource === 'string') {
                        string = stringOrSource;
                    } else if (stringOrSource instanceof Source) {
                        string = s.source()
                    }

                    if (string && WEBPACK_REQUIRE_REGEX.test(string)) {
                        index = i;
                        break;
                    }
                }

                if (index !== undefined) {
                    source.children.splice(
                        index + 1,
                        0,
                        `/* react intl extract hot update */ if (__webpack_require__.intlChunkLoader.hot) {__webpack_require__.intlChunkLoader.hot(${JSON.stringify(this.manifest)}, ${JSON.stringify(hotMessages)});\n}`
                    );
                }

                return source;
            });

            // add assets to compilation
            compilation.hooks.additionalAssets.tap(IDENTIFIER, () => {
                const {assets} = this;

                Object.keys(assets).forEach(filename => {
                    compilation.assets[filename] = new RawSource(assets[filename]);
                });
            });
        });
    }
}

ReactIntlExtractWebpackPlugin.BABEL_LOADER_METADATA_SUBSCRIBER = IDENTIFIER;

module.exports = ReactIntlExtractWebpackPlugin;
