# css-modules-fix-local-keyframes-loader

For some reason when using keyframes keyword in :local scope, the output contains :local(classname) instead of just class name like it should. This loader fixes this bug.

```
npm i @react-app/css-modules-fix-local-keyframes-loader
```


<br />
To use this loader add it to chain after css-loader.

In development:

```
{
  test: /\.module\.css$/,
  use: [
    'style-loader',
    'css-modules-fix-local-keyframes-loader',
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
    'css-modules-fix-local-keyframes-loader',
    {
      loader: 'css-loader',
      options: {
        modules: true,
      }
    },
  ],
}
```
