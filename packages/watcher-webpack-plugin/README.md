# watcher-webpack-plugin

Webpack plugin to watch files with chokidar using glob. Runs webpack's subcompiler on file change if it is not already watched by webpack, runs callback on delete. This plugin is mainly used to enhance developer experience when generating typings on the fly when creating new files (*.module.css, *.graphql, ...) so you can use typings straight away when writing new TS files. Created for the purpose of react-scripts-ext package.

<br />
Example usage:

```
config.plugins = [
    ...
    new WatcherWebpackPlugin('**/*.(module.css|graphql)' ,{
        onRemove: (file) => Promise.all([
          unlinkIfExists(`${file}.d.ts`),
          unlinkIfExists(`${file}.types.ts`),
        ]),
    }),
];

```
