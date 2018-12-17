import 'source-map-support/register';
import * as express from 'express';
import {readFile} from 'fs';
import * as path from 'path';

type Cache<T = string> = Map<string , T>;
const cache: Cache = new Map();

function read(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        readFile(file, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(data);
        });
    });
}

export default function serve(middleware: express.RequestHandler, buildPath: string, host = '0.0.0.0', port = 5000) {
    return new Promise((resolve, reject) => {
        const app = express();

        app.use((req, res, next) => {
            res.locals.readAsset = (asset: string) => {
                const cached = cache.get(asset);

                if (cached) {
                    return Promise.resolve(cached);   
                }

                return read(path.join(buildPath, asset))
                    .then(data => {
                        if (asset.endsWith('.json')) {
                            return JSON.parse(data);
                        }

                        return data;
                    })
                    .then(data => {
                        cache.set(asset, data);
                        return data;

                    });
            };

            middleware(req, res, next);
        });

        app.listen(port, host, (err?: Error) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}
