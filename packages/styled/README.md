# styled

```
npm i @react-app/styled
```


React HOC to style React components with css modules. Typescript compatible.

test.module.css
```
.test {
    background-color: blue;
}
```

test.tsx
```
import Styled from '@react-app/styled';
import defaultStyles from './test.module.css';

interface Props {
    styles: typeof defaultStyles;
}

const Test: React.FunctionComponent<Props> = ({styles}) => (
    <div className={styles.test} />
);

export default Styled(defaultStyles)(Test);
```

fragment.module.css
```
.fragment { // <- name of the class does not matter
    composes: test from './test.module.css';
    background-color: red;
}

.random {
    color: yellow;
}

```

fragment.tsx

``` 
import * as React from 'react';
import Test from './test';
import defaultStyles from 'test2.module.css';

const Test2 = Test.extend(defaultStyles);

export default Styled(defaultStyles)(({styles}) => {
    return (
        <React.Fragment>
            <Test /> { /* <- has blue background */}
            <Test2 /> { /* <- has red background */}
            <div className={styles.random} />
        </React.Fragment>
    );
});

```

parent.module.css
```
.changeAllTestChildren { // <- name of the class does not matter
    composes: test from './test.module.css';
    background-color: green;
}

.button {
    color: blue;
}
```

parent.tsx
```
import * as React from 'react';
import Test from './test';
import Fragment from './fragment';
import defaultStyles from './parent.module.css';

const TestProvider = Test.compose(defaultStyles); // <- affects all children of Test down under, it is possible to target only certain children of Test with css selectors in parent.module.css 

class Parent extends React.PureComponent {
    render() {
        return (
            <TestProvider>
                <Fragment /> {/* Test has green background, Test2 is not affected */}
                <button className={this.props.styles.button}>B</button>
            </TestProvider>
        )
    }
}

export default Styled(defaultStyles)(Parent);
```

```
... and so on
```

## API

```
interface Styles {
    {key: string}: string;
}

interface StyledComponent<Props> = React.ForwardRef<Props without styles prop>> & {
    compose(styles: Styles) => StyledComponent<Props>,
    extend(styles: Styles) => React.FunctionComponent<{}>,
}

Styled(styles: Styles)(Component: React.ComponentClass<Props> | React.FunctionComponent<Props> | React.ForwardRefComponent<Props> ): StyledComponent<Props>;
```