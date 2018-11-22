const {cloneDeepWith: visitor} = require('lodash');
const create = require('babel-preset-react-app');

module.exports = function(api, opts) {
    const preset = create(api, opts);

    visitor(preset.presets, (value) => {
        if (value instanceof Array) {
            if (value.length > 1 && value[1] instanceof Object && value[1].targets) {
                if (!value[1].targets.node) {
                    value[1].targets = {
                        esmodules: true,
                    };
                }
            }
        }
    });

    return preset;
};