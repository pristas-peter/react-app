module.exports = function (source) {
    this.cacheable();

    let output = source;

    source.split(' ').forEach(word => {
        const matches = word.match(/:local\((.+)\)/);

        if (matches) {
            const className = matches[1];

            const localNameMatches = source.match(new RegExp(`"${className}": "(.+)"`));

            if (localNameMatches) {

                output = output.replace(new RegExp(`:local\\(${className}\\)`, 'g'), localNameMatches[1]);
            }
        }
    });

    return output;
};

