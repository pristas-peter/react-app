# css-modules-typings-loader

Webpack loader to generate TS typings of local classnames as [filename].d.ts file alongside source file.

```
npm i @react-app/css-modules-typings-loader
```

<br />
To use this loader add it to chain after css-loader.

In development:

```
{
  test: /\.module\.css$/,
  use: [
    'style-loader',
    'css-modules-typings-loader',
    {
      loader: 'css-loader',
      options: {
        modules: true,
      }
    },
  ],
}
```

In production:

```
{
  test: /\.module\.css$/,
  use: [
    MiniCssExtractPlugin.loader
    'css-modules-typings-loader',
    {
      loader: 'css-loader',
      options: {
        modules: true,
      }
    },
  ],
}
```
<br>

**Configuration**

You can create .cssmodulestypings.js config file in the current working directory or pass options object via loader options. It supports following:

```
{
    suffix: (filename: string) => string // add custom suffix to generated interface name (defaults to Styles)
}
```

