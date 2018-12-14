import * as path from 'path';
import {runInThisContext} from 'vm';
import * as webpack from 'webpack';
import fetch, { Response } from 'node-fetch';
import * as express from 'express';
import * as middleware from 'webpack-dev-middleware';
import * as httpProxy from 'http-proxy';
import * as http from 'http';
import * as compression from 'compression';

const sourceMap = new Map<string, Buffer>();

require('source-map-support').install({
    retrieveSourceMap: function(url: string) {
        const map = sourceMap.get(url);

        if (map) {
            return {
                url,
                map: map.toString(),
            };
        }
        return null;
    }
});

export class AssetReadError extends Error {
    static code = 'ASSET_READ_ERROR';

    constructor(public response: Response) {
        super('Response read error.');
    }
}

function outputFile(stats: webpack.Stats) {
    const {entrypoints, outputPath} = stats.toJson({all: false, entrypoints: true, outputPath: true} as webpack.Stats.ToJsonOptionsObject);

    let main;

    for (const key of Object.keys(entrypoints)) {
        for (const asset of entrypoints[key].assets) {
            if (asset.endsWith('.js')) {
                main = asset;
                break;
            }
        }
        if (main) {
            break;
        }
    }

    return path.join(outputPath, main);
}

export function watch(
    config: webpack.Configuration,
    host = '0.0.0.0',
    port = 5000,
    webpackDevserverUrl = 'http://localhost:3000/',
) {

    let lastEndTime: webpack.Stats['endTime'];
    let serverMiddleware: express.RequestHandler;
    
    const app = express();
    const proxy = httpProxy.createProxyServer({
        target: webpackDevserverUrl,
        ws: true,
    });

    app.use(compression());

    app.use(middleware(webpack(config) as any, {
        logLevel: 'info',
        serverSideRender: true,
        stats: 'minimal',
    } as any));

    app.use((req, res, next) => {
        const {fs, webpackStats} = res.locals as {fs: any, webpackStats: webpack.Stats};
        
        res.locals.readAsset = (asset: string) => 
        fetch(`${webpackDevserverUrl}${asset}`).then(response => {
            if (response.ok) {
                if (asset.endsWith('.json')) {
                    return response.json();
                }

                return response.text();
            }
            return Promise.reject(new AssetReadError(response))
        });

        if (lastEndTime !== webpackStats.endTime) {
            const filename = outputFile(webpackStats);
            const mapFilename = `${filename}.map`;

            if (fs.existsSync(mapFilename)) {
                sourceMap.set(filename, fs.readFileSync(mapFilename));
            }

            serverMiddleware = runInThisContext(fs.readFileSync(filename), filename).default;
        }

        lastEndTime = webpackStats.endTime;
        serverMiddleware(req, res, next);
    });

    app.use((req, res) => {
        proxy.web(req, res);
    });

    const server = http.createServer(app)

    server.on('upgrade', function (req, socket, head) {
        proxy.ws(req, socket, head);
    });

    server.listen(port, host);
}