# graphql-typings-loader

Webpack loader to generate TS typings of graphql files as d.ts file alongside source file. Uses apollo-codegen under the hood. Supports #import syntax.

<br />
To use this loader add it to chain before any graphql loader which outputs document in JS.


```
{
  test: /\.graphql$/,
  use: [
    'graphql-tag/loader'
    'graphql-typings-loader',
  ],
}
```

By default it tries to read './schema.json' in the current working directory (directory from which webpack was run). If it does not exist, it outputs nothing. 

You can create .graphqltypings.js config file in the current working directory. It supports following:

```
{
    schema: "string | filename to read schema from,
        default: ./schema.json",

    legacy: "boolean | uses apollo-codegen-typescript-legacy when true instead of apollo-codegen-typescript,
        default: false,

    options: "object | options for apollo-codegen-typescript,
        default: {
            addTypename: true,
            mergeInFieldsFromFragmentSpreads: true,
            passthroughCustomScalars: true,
            customScalarsPrefix: 'GraphQLScalar'," 
        }
}
```

