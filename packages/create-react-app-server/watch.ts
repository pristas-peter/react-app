import * as webpack from 'webpack';
import fetch, { Response } from 'node-fetch';
import * as path from 'path';
import * as Koa from 'koa';
import * as koaWebpack from 'koa-webpack';

export class ReadAssetError extends Error {
    constructor(public response: Response) {}
}

export default function watch(
    config: webpack.Configuration,
    host = '0.0.0.0',
    port = 5000,
    devUrl = 'http://127.0.0.1:3000/',
) {
    return koaWebpack({
        compiler: webpack({
            entry: [
                path.join()
            ]
        }) as any,
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
                    fetch(`${devUrl}${asset}`).then(response => {
                        if (response.ok) {
                            if (asset.endsWith('.json')) {
                                return response.json();
                            }

                            return response.text();
                        }
                        return Promise.reject(new ReadAssetError(response))
                    });

                console.log(fs, config.output);
                return next();
            });

            app.listen(port, host);
        });

}