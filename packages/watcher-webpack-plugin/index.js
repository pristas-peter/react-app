const chokidar = require('chokidar');
const fs = require('fs');
const MemoryFS = require('memory-fs');
const path = require('path');
const tmp = require('tmp-promise');
const webpack = require('webpack');

class WatcherWebpackPlugin {
    constructor(pattern, {onError = console.error, onRemove} = {}) {
        this.identifier = `WatcherWebpackPlugin[${pattern}]`;
        this.pattern = pattern;
        this.onError = onError;
        this.onRemove = onRemove;
        this.apply = this.apply.bind(this);
    }

    apply(compiler) {
        this.compiler = compiler;

        compiler.hooks.thisCompilation.tap(this.identifier, (compilation) => {
            this.compilation = compilation;
        });
        compiler.hooks.watchRun.tap(this.identifier, () => {
            if (!this.watcher) {
                const config = {...compiler.options};
                delete config.plugins;
           
                this.watcher = chokidar.watch(this.pattern, {
                    ignoreInitial: true,
                })
                    .on('change', file => {
                        this.handleFile(path.join(process.cwd(), file))
                            .catch(this.onError);
                    })
                    .on('unlink', (file) => {
                        if (this.onRemove) {
                            this.onRemove(path.join(process.cwd(), file))
                                .catch(this.onError)
                        }
                    });
            }
        });

        compiler.hooks.watchClose.tap(this.identifier, () => {
            if (this.watcher) {
                this.watcher.close();
                delete this.watcher;
            }
        });
    }

    handleFile(file) {
        if (this.compilation && this.compilation.fileDependencies && this.compilation.fileDependencies.has(file)) {
            return Promise.resolve();
        }

        return tmp.file({postfix: '.js'})
            .then(({path: entry, cleanup}) => new Promise((resolve, reject) => {
                fs.writeFile(entry, `require('${file}');`, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.run(entry)
                            .then(resolve)
                            .catch(reject);
                    }
                })
            })
                .finally(cleanup)
            );

    }

    run(entry) {
        const config = {
            ...this.compiler.options,
            devtool: false,
            entry,
            plugins: [],
        };

        const compiler = webpack(config);
        compiler.outputFileSystem = new MemoryFS();

        return new Promise((resolve, reject) => compiler.run((err, stats) => {
            if (err) {
                reject(err);
            } else if (stats.hasErrors()) {
                reject(new Error(`${stats.toJson({all: false, errors: true}).errors.map((error) => `${error}\n`)}`));
            } else {
                resolve();
            }
        }));
    }
}

module.exports = WatcherWebpackPlugin;
