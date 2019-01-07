# responsive-image-loader

```
npm i @react-app/responsive-image-loader
```

Webpack loader to create responsive images. Uses responsive-loader with sharp adapter under the hood with custom predefined options.
<br />
<br />
Can be used with babel-plugin-named-asset-import (create-react-app) to export responsiveImage instance like so:

```
// loaderMap comes from babel-plugin-named-asset-import configuration

['png', 'jpg', 'bmp', 'jpeg'].forEach(ext => {
    loaderMap[ext] = {
        responsiveImage: `!!${require.resolve('@react-app/responsive-loader')}![path]`,
    }
})
```
