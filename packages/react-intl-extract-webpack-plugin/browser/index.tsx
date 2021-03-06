/// <reference types="webpack-env" />

type Chunk = string;

export interface Manifest {
    [chunk: string]: {
        [locale: string]: string;
    }
}

export interface LocaleMessages {
    [id: string]: string;
}

export interface Messages {
    [locale: string]: LocaleMessages;
}

export interface Cached {
    [chunkGroupName: string]: Messages;
}

export class IntlChunkLoader {
    chunksToLoad: Set<Chunk>;
    manifest: Manifest;
    cache: Messages;
    locale?: string;
    loadedChunksPerLocale: Map<string, Set<Chunk>>;

    constructor(manifest: Manifest, chunks: Chunk[] = [], cached: Cached = {}) {
        this.manifest = manifest;
        this.chunksToLoad = new Set(chunks);
        this.cache = {};
        this.loadedChunksPerLocale = new Map();

        if (cached) {
            Object.keys(cached).forEach(chunk => {
                const cachedMessages = cached[chunk];
                this.updateCache(cachedMessages);

                Object.keys(cachedMessages).forEach(locale => {
                    this.setChunkAsLoaded(chunk, locale);
                })
            })
        }
    }

    updateCache(messages: Messages) {
        Object.keys(messages).forEach(locale => {
            if (!this.cache[locale]) {
                this.cache[locale] = {};
            }
            Object.assign(this.cache[locale], messages[locale]);
        });
    }

    setChunkAsLoaded(chunk: Chunk, locale: string) {
        const set = this.loadedChunksPerLocale.get(locale);
        if (set) {
            set.add(chunk);
        } else {
            this.loadedChunksPerLocale.set(locale, new Set([chunk]));
        }
    }

    load = (chunk: Chunk, locale: string) => {
        const loadedChunks = this.loadedChunksPerLocale.get(locale);
        const src = this.manifest[chunk] && this.manifest[chunk][locale];

        if (!src || (loadedChunks && loadedChunks.has(chunk))) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();

            request.open('GET', src);
            request.addEventListener('load', () => {
                try {
                    this.updateCache({
                        [locale]: JSON.parse(request.responseText),
                    });

                    this.setChunkAsLoaded(chunk, locale);

                } catch (e) {
                    reject(e);
                }

                resolve();
            });

            request.addEventListener('error', reject);
            request.send();
        }) as Promise<void>;
    }

    loadPending(locale: string): Promise<void> {
        const size = this.chunksToLoad.size;

        return Promise.all(Array.from(this.chunksToLoad).map(chunk => this.load(chunk, locale)))
            .then(() => {
                if (this.chunksToLoad.size > size) {
                    return this.loadPending(locale);
                }
            });
    }

    setLocale(locale: string) {
        return this.loadPending(locale)
            .then(() => {
                this.locale = locale;
            });
    }

    push(chunk: Chunk) {
        this.chunksToLoad.add(chunk);

        if (this.locale) {
            return this.load(chunk, this.locale);
        }

        return Promise.resolve();
    }

    hot(manifest: Manifest, messages: Messages) {
        Object.assign(this.manifest, manifest);
        this.updateCache(messages);
    }

    get messages(): LocaleMessages | undefined {
        if (this.locale) {
            return this.cache[this.locale];
        }

        return undefined;
    }
}

export default function initialize(cached?: Cached): IntlChunkLoader {
    if (!__webpack_require__.intlManifest) {
        throw new Error('Manifest generated by react-intl-extract-webpack-plugin not found. Make sure to use this plugin in your webpack config.');
    }

    if (!(__webpack_require__.intlChunkLoader instanceof IntlChunkLoader)) {
        __webpack_require__.intlChunkLoader = new IntlChunkLoader(
            __webpack_require__.intlManifest,
            __webpack_require__.intlChunkLoader,
            cached,
        );
    } else {
        throw new Error('Initialize function for intl chunk loader should be called only once.');
    }

    return __webpack_require__.intlChunkLoader;
}
