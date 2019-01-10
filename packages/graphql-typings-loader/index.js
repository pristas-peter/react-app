require('apollo-codegen-core/lib/polyfills');

const {compileToLegacyIR} = require('apollo-codegen-core/lib/compiler/legacyIR');
const {compileToIR} = require('apollo-codegen-core/lib/compiler');
const {generateGlobalSource, generateLocalSource} = require('apollo-codegen-typescript');
const {generateSource} = require('apollo-codegen-typescript-legacy');
const {getOptions} = require('loader-utils');
const {buildClientSchema, parse} = require('graphql');
const fs = require('fs');
const path = require('path');
const pify = require('pify');

function findSchemaData(data) {
    if (data.__schema) {
        return data;
    }

    for (key of Object.keys(data)) {
        const schemaData = findSchemaData(data[key]);

        if (schemaData) {
            return schemaData;
        }
    }

    return null;
}


function getConfig(loader) {
    const config = getOptions(loader) || {}; 

    try {
        Object.assign(config, require(path.join(process.cwd(), '.graphqltypings')));
    } catch (err) {
        // pass
    }

    return {
        schema: 'schema.json',
        legacy: false,
        ...config,
        options: {
            addTypename: true,
            mergeInFieldsFromFragmentSpreads: true,
            passthroughCustomScalars: true,
            customScalarsPrefix: 'GraphQLScalar',
            ...config.options,
        },
    };
};

function generateOutput(typings) {
    let output = typings;

    const match = typings.match(/interface ([\s\S]+?};)/g);
    if (match) {
        match.forEach(m => {
            output = output.replace(m, m.replace(/;$/, ''));
        })
    }

    return `import {DocumentNode} from 'graphql/language/ast';
${output}
declare var document: DocumentNode;
export default document;`
}

function generateTypesOutput(typings) {
    const re = new RegExp(/export enum .+ \{[^]+?\}/, 'g');
    const types = [];

    let result = re.exec(typings);

    while (result !== null) {
        types.push(result[0]);
        result = re.exec(typings);
    }

    if (types.length) {
        types.unshift(`/* tslint:disable */
//  This file was automatically generated and should not be edited.\n`);
    }
    
    return types.join('');
}

function write(filename, data) {
    return pify(fs.exists, {errorFirst: false})(filename)
        .then(exists => {
            if (exists) {
                return pify(fs.readFile)(filename, 'utf8')
                    .then(content => {
                        if (content != data) {
                            return Promise.reject();
                        }
                    });
            } else {
                return Promise.reject();
            }
        })
        .catch(() => pify(fs.writeFile)(filename, data));
}

module.exports = function (source) {
    this.cacheable();
    const callback = this.async();

    const loader = this;
    const files = new Set();

    const {schema: schemaFile, legacy, options} = getConfig(loader);

    const loadDocumentSource = (str, context) => Promise.all(
        str.split(/[\r\n]+/)
            .map(line => {
                if (/^#import/.test(line)) {
                    
                    const match = line.match(/['"](.+)['"]/);

                    if (match) {
                        return pify(loader.resolve)(context, match[1])
                            .then(file => {
                                if (files.has(file)) {
                                    return Promise.resolve('');
                                }
            
                                files.add(file);
                                loader.addDependency(file);

                                return pify(fs.readFile)(file, 'utf8')
                                    .then(data => loadDocumentSource(data, path.dirname(file)));
                            })
                    } else {
                        return Promise.reject(new Error('Could not parse #import statement'))
                    }
                } else {
                    return Promise.resolve(line);
                }
            })
    )
        .then(sources => sources.join('\n'));


    const loadSchema = (schemaPath) => pify(fs.exists, {errorFirst: false})(schemaPath)
        .then(exists => {
            if (!exists) {
                return null;
            }

            loader.addDependency(schemaPath);
            return pify(fs.readFile)(schemaPath, 'utf8')
                .then(JSON.parse)
                .then(findSchemaData);
        });


    loadSchema(path.join(process.cwd(), schemaFile))
        .then(schema => {
            if (!schema) {
                return null;
            }
            return loadDocumentSource(source, loader.context)
                .then((documentSource) => {
                    const clientSchema = buildClientSchema(schema);
                    const document = parse(documentSource);

                    let typings;

                    if (legacy) {
                        const context = compileToLegacyIR(clientSchema, document, options);
                        typings = generateSource(context);
                    } else {
                        const context = compileToIR(clientSchema, document, options);
                        const sources = generateLocalSource(context);

                        typings = sources.map(({content}) => {
                            const {fileContents} = content();
                            return fileContents.replace();
                        }).join('');

                        typings = `${generateGlobalSource(context).fileContents}\n${typings}`;
                    }

                    return write(`${loader.resourcePath}.d.ts`, generateOutput(typings))
                        .then(() => {
                            const output = generateTypesOutput(typings);

                            if (output) {
                                return write(`${loader.resourcePath}.types.ts`, output);
                            }

                            return null;
                        });
                });
        })
        .then(() => callback(null, source))
        .catch(err => {
            callback(err);
        });
}