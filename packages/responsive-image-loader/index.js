const loader = require('responsive-loader');

module.exports = function (source) {
    this.loaders[this.loaderIndex].options = {
        adapter: require('responsive-loader/sharp'),
        // based on https://material.io/design/layout/responsive-layout-grid.html#breakpoints
        sizes: [1920, 1600, 1440, 1280, 1024, 960, 840, 720, 600, 480, 360],
        placeholderSize: 30,
        publicPath: 'static/media'
     };

    const async = this.async.bind(this);

    this.async = () => {
        const callback = async();

        return (err, source) => {
            callback(err, source && source.replace(/module\.exports = /g, 'export const responsiveImage ='));
        }
    }

    return loader.bind(this)(source);
}

module.exports.raw = true;