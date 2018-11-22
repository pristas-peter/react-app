# responsive-image-loader

Webpack loader to create responsive images. Uses responsive-loader under the hood with custom predefined options. Created for the purpose of react-scripts-ext package.

<br />
Can be used with babel-plugin-named-asset-import to export responsiveImage instance like so:

```
// loaderMap comes from babel-plugin-named-asset-import configuration

['png', 'jpg', 'bmp', 'jpeg'].forEach(ext => {
    loaderMap[ext] = {
        responsiveImage: `!!${require.resolve('./images/responsive-loader')}![path]`,
    }
})
```
