# css-modules-typings-loader

Webpack loader to generate TS typings of local classnames as [filename].d.ts file alongside source file. If d.ts file contains GraphQL enums, they are also extracted to [filename].types.ts file so they can be used in TS code.

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


