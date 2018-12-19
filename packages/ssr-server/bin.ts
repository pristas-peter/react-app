import 'source-map-support/register';
import {ArgumentParser} from 'argparse';
import * as path from 'path';
import serve from './index';
import {version} from './package.json';

const parser = new ArgumentParser({
    addHelp: true,
    version,
    prog: 'ssr-server',
});

parser.addArgument([ '-m', '--middleware' ], {
    required: true,
    help: 'middleware path',
});

parser.addArgument([ '-b', '--build-path' ], {
    help: 'build path',
    defaultValue: path.join(process.cwd(), 'build'),
});

parser.addArgument('--hostname', {
    defaultValue: '0.0.0.0',
    help: 'hostname'
});

parser.addArgument('--port', {
    defaultValue: 5000,
    type: 'int',
    help: 'port'
});

const args = parser.parseArgs();
const middlewarePath = path.isAbsolute(args.middleware) ? args.middleware : path.join(process.cwd(), args.middleware);

serve(require(middlewarePath).default, args.buildPath, args.host, args.port)
    .catch(err => {
        throw(err)
    });
