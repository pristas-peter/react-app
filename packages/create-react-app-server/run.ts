import {readFile} from 'fs';
import {join} from 'path';

export default function run(
    buildPath: string,
    host = '0.0.0.0',
    port = 5000,
    ) {

    const read = (asset: string) => 
        new Promise<string>((resolve, reject) => {
            readFile(join(buildPath, asset), 'utf-8', (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(data);
            });
        });

    
}
