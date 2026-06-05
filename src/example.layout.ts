import { GoldenLayout, LayoutConfig, ComponentContainer } from 'golden-layout';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
import './style.css';

const config: LayoutConfig = {
    header: {
        popout: false
    },
    root: {
        type: 'row',
        content: [
            {
                type: 'stack',
                content: [
                    {
                        type: 'component',
                        componentType: 'timeline',
                        componentState: {},
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentType: 'VFX',
                        componentState: {},
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentType: 'Hitbox',
                        componentState: {},
                        isClosable: false
                    }
                ]
            },
            {
                type: 'column',
                width: 25,
                content: [
                    {
                        type: 'component',
                        componentType: 'library',
                        componentState: {},
                        isClosable: false
                    }
                ]
            },
            {
                type: 'component',
                componentType: 'world',
                componentState: {},
                isClosable: false
            }
        ]
    }
};

// setup layout
const container = document.getElementById('app') as HTMLElement;
const layout = new GoldenLayout(container);
// Register components
['timeline', 'VFX', 'Hitbox', 'library', 'world'].forEach(name => {
    layout.registerComponentFactoryFunction(name, (container: ComponentContainer) => {
        const el = document.createElement('div');
        el.style.padding = '20px';
        el.style.color = '#eee';
        el.style.fontFamily = 'sans-serif';
        el.innerHTML = `<h3>${name.toUpperCase()}</h3><p>Component content goes here.</p>`;
        container.element.appendChild(el);
    });
});
layout.loadLayout(config);