import * as path from 'path';
import {runInThisContext} from 'vm';
import * as webpack from 'webpack';
import fetch, { Response } from 'node-fetch';
import * as Koa from 'koa';
import * as koaWebpack from 'koa-webpack';

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

export default function watch(
    config: webpack.Configuration,
    host = '0.0.0.0',
    port = 5000,
    webpackDevserverUrl = 'http://127.0.0.1:3000/',
) {

    let lastEndTime: number;
    let serverMiddleware: Koa.Middleware;

    return koaWebpack({
        compiler: webpack(config) as any,
        devMiddleware: {
            logLevel: 'info',
            serverSideRender: true,
            stats: 'minimal',
        } as any,
        hotClient: false,
    })
        .then(middleware => {
            const fs = middleware.devMiddleware.fileSystem;
            const app = new Koa();

            app.use(middleware);
            app.use((context, next) => {
                context.readAsset = (asset: string) => 
                    fetch(`${webpackDevserverUrl}${asset}`).then(response => {
                        if (response.ok) {
                            if (asset.endsWith('.json')) {
                                return response.json();
                            }

                            return response.text();
                        }
                        return Promise.reject(new AssetReadError(response))
                    });

                if (lastEndTime !== context.state.webpackStats.endTime) {
                    serverMiddleware = runInThisContext(fs.readFileSync(outputFile(context.state.webpackStats))).default;
                }

                lastEndTime = context.state.webpackStats.endTime;
                return serverMiddleware(context, next);
            });

            app.listen(port, host);
        });

}