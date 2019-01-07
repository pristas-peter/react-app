# react-intl-extract-webpack-plugin

```
npm i @react-app/react-intl-extract-webpack-plugin
```

Webpack plugin to extract react-intl translations with suppport for on demand chunk loading per active locale during dynamic imports. Also supports HMR and SSR.

Usage:

* get familiar with react-intl ecosystem

* add to babel-loader's options:
    ```
    options: {
        ...
        plugins: [
            ...
            '@react-app/react-intl-extract-webpack-plugin/babel',
            ...
        ]
        metadataSubscribers: [ReactIntlExtractWebpackPlugin.BABEL_LOADER_METADATA_SUBSCRIBER],
        ...
    },
    ```

* add plugin to webpack's config:

    ```
    const ReactIntlExtractWebpackPlugin = require('@react-app/react-intl-extract-webpack-plugin');

        plugins: [
            ...
            new ReactIntlExtractWebpackPlugin(),
            ...
        ]
    ```

* create translations.js file in root of your project's folder (cwd for webpack)
  ```
  // type Descriptor = {
  //    id: string,
  //    defaultMessage?: string,
  //    description?: string,
  // }

  // type Translations = {
  //    [locale: string]: {
  //        [id: string]: string,
  //    },
  // } 

  module.exports = (descriptors: Iterator<Descriptor>) => {
      /// your code to resolve descriptor translations
      /// you can even query/update your SQL database or read json file
      return Promise(translations) as Promise<Translations>;
  }
  ```

* add this code in userland before ReactDOM.render:
  ```
    import React from 'react';
    import ReactDOM from 'react-dom';
    import {IntlProvider, addLocaleData} from 'react-intl';
    import initialize from '@react-app/react-intl-extract-webpack-plugin/browser';

    import App from './App';

    const chunkLoader = initialize();
    const locale = 'sk'; // <- you can resolve this dynamically

    Promise.all([ 
        // tip: use webpackImport magic comment to bundle only languages you need
        import(/* webpackChunkName: "[request]" */ `react-intl/locale-data/${locale}`),
        chunkLoader.setLocale(locale),
    ])
        .then(([locale]) => {
            addLocaleData(locale.default);
            ReactDOM.render(<IntlProvider messages={chunkLoader.messages} locale={chunkLoader.locale}><App /></IntlProvider>, document.getElementById('root'));
        })

  ```

Note: This plugin uses it's own babel plugin which is a fork of react-intl-babel-plugin. It does not enforce defaultMessage field to save bundle size when you want to dynamically switch between locales at the start of the app.

Note: react-intl's addLocaleData is not managed by chunk loader intentionally.

<br />

When new chunk is requested with import(...), chunkLoader loads all missing translations for current active locale using patched webpack's internals 

<br />

It is possible to dynamically change locale after bootstrap, chunkLoader stores already loaded webpack chunks and loads them all for newly set locale:
```
    Promise.all([
        import(/* webpackChunkName: "[request]" */ `react-intl/locale-data/${locale}`),
        chunkLoader.setLocale(locale),
    ]).then(() => {
        this.setState({
            locale: chunkLoader.locale,
            messages: chunkLoader.messages,
        }); // <- use this state as <IntlProvider> props, you will need to also use key={locale} hack to re-render everything until react-intl start's to use new React Context API
    })
```

<br />

For SSR you can use **react-intl-messages.[suffix].json** with all translations, manifest file **react-intl-manifest.[suffix].json** and **react-intl-chunkgroup-messages.[suffix].json** which are generated during build.

<br />

Webpack plugin also accepts options (defaults are):
```
{
    development: process.env.NODE_ENV === 'development',
    outputPath: 'static/intl/',
    suffix: '',
}
```
