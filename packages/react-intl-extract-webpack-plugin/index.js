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

        this.moduleDescriptorIds = new WeakMap();
        this.descriptors = new Map();
        this.translations = {};
    }

    assetPath(name, content) {
        return `${this.options.outputPath}${name.replace(/\.\[hash\]/, this.options.development ? '' : '.' + getHashDigest(content))}`;
    }

    apply(compiler) {
        compiler.hooks.thisCompilation.tap(IDENTIFIER, (compilation) => {
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

            compilation.hooks.optimizeTree.tapPromise(IDENTIFIER, () => {
                // load translations that were needed in this compilation phase
                const promise = this.loadTranslations(this.descriptors.values());
                
                // extract descriptor ids per chunkGroup
                const idsPerChunkGroup = new Map();
                                        
                for (const chunkGroup of compilation.chunkGroups) {
                    for (const chunk of chunkGroup.chunks) {
                        for (const mod of chunk.getModules()) {
                            const ids = this.moduleDescriptorIds.get(mod);

                            if (ids) {
                                idsPerChunkGroup.set(chunkGroup, ids);
                            }
                        }
                    }
                }

                return promise
                    .then(loadedTranslations => {
                        const translations = Object.assign(this.translations, loadedTranslations);

                        this.manifest = {};
                        this.assets = {};
                        
                        const messages = {};
                        const chunkGroupNameTranslations = {};
                        
                        idsPerChunkGroup.forEach((ids, chunkGroup) => {
                            chunkGroupNameTranslations[chunkGroup.name] = {};

                            ids.forEach(id => {
                                const translation = translations[id];

                                if (translation) {
                                    Object.keys(translation).forEach(locale => {
                                        if (!messages[locale]) {
                                            messages[locale] = {};
                                        }
                                        messages[locale][id] = translation[locale];

                                        if (!chunkGroupNameTranslations[chunkGroup.name][locale]) {
                                            chunkGroupNameTranslations[chunkGroup.name][locale] = {};   
                                        }
                                        
                                        chunkGroupNameTranslations[chunkGroup.name][locale][id] = translation[locale];
                                    });
                                }
                            });
                        });

                        Object.keys(chunkGroupNameTranslations).forEach((chunkGroupName) => {
                            const chunkGroupTranslations = chunkGroupNameTranslations[chunkGroupName];

                            Object.keys(chunkGroupTranslations).forEach(locale => {
                                const chunkGroupLocaleTranslations = JSON.stringify(chunkGroupTranslations[locale]);

                                if (chunkGroupLocaleTranslations) {
                                    if (!this.manifest[chunkGroupName]) {
                                        this.manifest[chunkGroupName] = {};
                                    }

                                    const filename = this.assetPath(`${chunkGroupName}.[hash].chunk.${locale}.json`, chunkGroupLocaleTranslations);
                                    this.manifest[chunkGroupName][locale] = `/${filename}`;
                                    this.assets[filename] = chunkGroupLocaleTranslations;
                                }
                            });
                        });

                        const json = JSON.stringify(messages);
                        this.assets[this.assetPath(`messages.[hash].json`, json)] = json;
                    })
                    .catch(error => {
                        compilation.errors.push(error);
                    });
            });

            compilation.hooks.additionalAssets.tap(IDENTIFIER, () => {
                const {assets} = this;

                Object.keys(assets).forEach(filename => {
                    compilation.assets[filename] = new RawSource(assets[filename]);
                });
            });

            const { mainTemplate, hotUpdateChunkTemplate } = compilation;

            mainTemplate.hooks.localVars.tap(IDENTIFIER, (source, chunk) => {
                const code = typeof chunk.id === 'string' ? `"${chunk.id}"` : chunk.id; 
                return Template.asString([
                    source,
                    '',
                    '// localVars',
                    `__webpack_require__.intlManifest = ${JSON.stringify(this.manifest)};`,
                    `__webpack_require__.intlChunkLoader = __webpack_require__.intlChunkLoader || [${code}];`,
                ]);
            });

            mainTemplate.hooks.requireEnsure.tap(IDENTIFIER,
                (source) => {
                    return Template.asString([
                        source,
                        `promises.push(Promise.resolve(__webpack_require__.intlChunkLoader.push(chunkId)));`,
                        '',
                    ]);
            });

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
        });
    }
}

ReactIntlExtractWebpackPlugin.BABEL_LOADER_METADATA_SUBSCRIBER = IDENTIFIER;

module.exports = ReactIntlExtractWebpackPlugin;
