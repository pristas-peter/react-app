interface ResponsiveImageSize {
    width: number;
    height: number;
    path: string;
}

interface ResponsiveImage {
    height: number;
    images: ResponsiveImageSize[];
    placeholder?: string;
    src: string;
    srcSet: string;
    toString(): string;
    width: number;
}

declare module '*.png' {
    export const responsiveImage: ResponsiveImage;
}

declare module '*.jpg' {
    export const responsiveImage: ResponsiveImage;
}

declare module '*.jpeg' {
    export const responsiveImage: ResponsiveImage;
}

declare module '*.bmp' {
    export const responsiveImage: ResponsiveImage;
}
