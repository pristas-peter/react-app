import * as React from 'react';

interface Styles {
    [key: string]: string;
}

function compose<S extends {}>(styles: {}, previousStyles: S) {
    const composed: Styles = {...previousStyles as Styles};

    const localsMap: Map<string, string> = new Map();

    Object.keys(previousStyles).forEach(key => {
        localsMap.set((previousStyles as Styles)[key].split(' ').shift()!, key);
    });

    Object.keys(styles).forEach(key => {
        const classNames = (styles as Styles)[key].split(' ');

        for (let i = 0; i < classNames.length; i++) { // tslint:disable-line
            const className = classNames[i];

            const localKey = localsMap.get(className);

            if (localKey) {
                composed[localKey] = (styles as Styles)[key];
                break;
            }
        }
    });

    return composed as S;
}

type InferProps<T> = T extends React.ComponentType<infer P> | React.Component<infer P> ? P : never;
type InferRef<T> = T extends React.ForwardRefExoticComponent<infer P> ? P extends React.ClassAttributes<infer A> ? A : never : T extends typeof React.Component ? T : never;

type StyledComponent<P, S, R> = React.ForwardRefExoticComponent<P & React.ClassAttributes<R>> & {
    defaultStyles: S,
    extend: (styles: {}) => StyledComponent<P, S, R>,
    compose: (styles: {}) => React.FunctionComponent<{}>,
}

export default function withStyled<S extends {}>(styles: S) {
    return <C extends React.ComponentType<P>, P extends {styles: S} = any>(Component: C) => {
        type InferedProps = InferProps<C>;
        type R = InferRef<C>;
    
        type DefaultProps = Pick<P, keyof typeof Component['defaultProps']>;
        type Props = Pick<InferedProps, Exclude<keyof InferedProps, keyof DefaultProps | 'styles'>> & {[K in keyof DefaultProps]+?: DefaultProps[K]};
    
        const Context = React.createContext<S>(styles);

        class Styled extends React.Component<Props & {forwardedRef?: React.Ref<R>}> {
            static contextType = Context;
            context!: S;

            render() {
                const {forwardedRef, ...rest} = this.props;
                return React.createElement(Component, {styles: this.context, ref: forwardedRef, ...rest} as any);
            }
        }

        const ForwardRefStyled = React.forwardRef<R, Props>((props: any, ref) => <Styled forwardedRef={ref} {...props} />);
        
        if (process.env.NODE_ENV === 'development') {
            const displayName = Component.displayName || Component.name
    
            if (displayName) {
                (Styled as any).displayName = `Styled${displayName}`; 
                ForwardRefStyled.displayName = `StyledForwardRef${displayName}`;
            }
        }
        
        (ForwardRefStyled as any).defaultStyles = styles;
        (ForwardRefStyled as any).extend = (newStyles: {}) => withStyled(compose(newStyles, styles))(Component);
        (ForwardRefStyled as any).compose = (newStyles: {}) => React.memo(
            ({children}) => <Context.Provider value={compose(newStyles, styles)} children={children} />
        );

        return ForwardRefStyled as StyledComponent<Props, S, R>;
    };
} 

