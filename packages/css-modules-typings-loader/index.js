const path = require('path');
const {readFile, writeFile} = require('fs');
const {camelize} = require('humps');
const {getOptions} = require('loader-utils');

function getConfig(loader) {
    const config = getOptions(loader) || {}; 

    try {
        Object.assign(config, require(path.join(process.cwd(), '.cssmodulestypings')));
    } catch (err) {
        // pass
    }

    return {
       suffix: () => 'Styles',
       ...config,
    };
};

function capitalizeFirstLetter(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function stripExtension(s) {
    return s.split('.')[0];
}

function validateName(s) {
    if (/^[a-zA-Z]/.test(s) === false) {
        return `I${s}`;
    }

    return s;
}

module.exports = function loader(webpackSource) {
    this.cacheable();

    const callback = this.async();
    
    const end = (err) => {
        if (err) {
            callback(err);
        } else {
            callback(null, webpackSource);
        }
    };
    
    const match = webpackSource.match(/exports\.locals.*=([^]*?);/);
    
    if (match) {
        const config = getConfig(this);

        const locals = [];

        match[1].split('\n').map(s => {
            const keyMatch = s.match(/"(.*?)": /);

            if (keyMatch) {
                locals.push(keyMatch[1]);
            }
        });

        if (locals.length) {
            const suffix = config.suffix(this.resource);
            const name = `${validateName(capitalizeFirstLetter(camelize(stripExtension(path.basename(this.resource)))))}${suffix}`;

            const output = `/* tslint:disable */
// This file was automatically generated and should not be edited.
export interface ${name} {
${locals.map(local => `\t'${local}': string;`).join('\n')}
}

export type I${name} = ${name};
export const locals: ${name};
export default locals;
`;

            const filename = `${this.resource}.d.ts`;

            readFile(filename, (err, data) => {
                if (err || data != output) {
                    writeFile(filename, output, end);
                } else {
                    end();
                }
            });
            
        } else {
            end();
        }
    } else {
        end();
    }

}
