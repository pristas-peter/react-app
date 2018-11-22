// I know this code is gross. 
// All of this should be rewritten with proper JS parser like acorn instead of using regexes.  

function loadRequire(source, context) {
    const handleError = (resolve, reject) => (err, ...rest) => {
        if (err) {
            reject(err);
        } else {
            resolve(...rest);
        }
    };

    const [, request, className] = source.match(/!(.*)"\)\.locals\["(.*)"]/);
    const filepath = request.split('!').pop();

    return new Promise((resolve, reject) => {
        context.resolve(context.context, filepath, handleError(resource => {

            const parts = [];
            let didFindCssLoader = false;

            context.request.split('!').forEach(part => {
                if (part.indexOf('css-loader') > -1) {
                    didFindCssLoader = true;
                }

                if (didFindCssLoader) {
                    parts.push(part);
                }
            });

            parts.pop();
            parts.push(resource.split('!').pop());

            const newRequest = `!!${parts.join('!')}`;

            context.loadModule(newRequest, handleError(loadedSource => {

                processSource(loadedSource, context)
                    .then(locals => {
                        resolve({
                            request: source,
                            className,
                            locals,
                        });
                    })
                    .catch(reject);

            }, reject));
        }, reject));
    });

}

function processSource(source, context) {
    return new Promise((resolve, reject) => {
        if (source.indexOf('exports.locals') > -1) {
            const localsSource = `{${source.split('exports.locals')[1].match(/\{([^}]+)\}/)[1]}}`;

            if (localsSource.indexOf('require(') === -1) {
                const locals = JSON.parse(localsSource);
                resolve(locals);
            } else {
                Promise.all(localsSource.split(' + ')
                    .filter(part => part.startsWith('require'))
                    .map(part => loadRequire(part, context)))
                        .then(results => {
                            const resultsPerRequest = {};

                            results.forEach(({request, ...rest}) => {
                                resultsPerRequest[request] = rest;
                            });

                            let newSource = '';

                            localsSource.split(' + ').forEach(part => {
                                if (part === '') {
                                    return;
                                }

                                if (part === '" "') {
                                    newSource += ' ';
                                } else if (part === '" ",') {
                                    newSource += ',';
                                } else if (part.startsWith('require')) {
                                    const result = resultsPerRequest[part];

                                    const classNames = result.locals[result.className];
                                    newSource = newSource.replace(/"$/g, '');
                                    newSource += classNames || '';

                                } else {
                                    newSource += part.replace(/^"",/g, '",').replace(/^""/g, '"');
                                }
                            });

                            resolve(JSON.parse(newSource));
                        })
                        .catch(reject);
            }

        } else {
            resolve(null);
        }
    });
}

module.exports = function (source) {
    this.cacheable();

    const callback = this.async();

    processSource(source, this)
        .then((locals) => {
            if (!locals) {
                callback(null, source);
            } else {
                let output = source;

                const composes = [];

                const classNamesInFile = new Set();

                Object.keys(locals).forEach(key => {
                    classNamesInFile.add(locals[key].split(' ')[0]);
                });

                Object.keys(locals).forEach(key => {
                    const classNames = new Set(locals[key].split(' '));

                    Array.from(classNames).forEach((className, i) => {
                        if (i > 0 && className.length) {
                            if (classNamesInFile.has(className)) {
                                classNames.delete(className);
                            }
                        }
                    });

                    if (classNames.size > 1) {
                        const className = Array.from(classNames)[0];

                        if (output.indexOf(`.${className}`) > -1) {
                            composes.push([className, classNames.size]);
                        }
                    }
                });

                if (composes.length) {
                    const css = output.match(/exports\.push\(\[module\.id, "([^]+)(",\ )/)[1];

                    let newCss = css;

                    composes.forEach(([className, length]) => {
                        let pattern = '';

                        for (let i = 0; i < length; i++) {
                            pattern = `${pattern}.${className}`;
                        }

                        newCss = newCss.replace(new RegExp(`.${className}`, 'g'), pattern);
                    });

                    output = output.replace(css, newCss);
                }

                callback(null, output);
            }
        })
        .catch(callback);
};
