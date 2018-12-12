import * as webpack from 'webpack';
import {request as http} from 'http';
import {request as https} from 'https';
import * as path from 'path';
import * as Koa from 'koa';
import * as koaWebpack from 'koa-webpack';

export default function watch(
    config: webpack.Configuration,
    host = '0.0.0.0',
    port = 5000,
    devHost = '127.0.0.1',
    devPort = 3000,
) {

    return koaWebpack({
        compiler: webpack(config) as any,
        devMiddleware: {
            logLevel: 'info',
            writeToDisk: true,
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
                context.readAsset = (asset: string) => {
        
                };

                console.log(config.output);

                return next();
            });
        });

}