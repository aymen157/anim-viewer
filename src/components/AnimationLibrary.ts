import './AnimationLibrary.css';

/**
 * Data structure for each item in the library.
 */
export interface CardData {
    src: string | null;
    name: string;
    data?: any;
}

/**
 * Button configuration for library items.
 */
export interface AnimationLibraryButton {
    icon: string;
    title: string;
    onClick: (ctx: AnimationLibraryContext) => void;
}

/**
 * Options for initializing the AnimationLibrary.
 */
export interface AnimationLibraryOptions {
    container: HTMLElement;
    className?: string;
    itemHeight?: number;
    buttons?: AnimationLibraryButton[];
}

export interface AnimationLibraryContext {
    card: CardData;
    element: HTMLElement;
    index: number;
    library: AnimationLibrary;
}

export type AnimationLibraryEvent = 'cardClick';
export type AnimationLibraryEventHandler = (ctx: AnimationLibraryContext) => void;

/**
 * AnimationLibrary Component
 * A high-performance list for thousands of items with search and virtualization.
 */
export class AnimationLibrary {
    private options: Required<AnimationLibraryOptions>;
    private root: HTMLDivElement;
    private searchInput: HTMLInputElement;
    private countLabel: HTMLSpanElement;
    private listContainer: HTMLDivElement;
    private spacer: HTMLDivElement; // To maintain scroll height
    
    private allCards: CardData[] = [];
    private filteredCards: CardData[] = [];
    private selectedAnimPath: string | null = null;
    
    private handlers: Map<AnimationLibraryEvent, AnimationLibraryEventHandler[]> = new Map();
    
    private itemHeight: number;
    private bufferCount: number = 20; // Number of extra items to render above/below viewport
    private lastScrollTop: number = 0;

    constructor(options: AnimationLibraryOptions) {
        this.options = {
            container: document.body,
            className: 'al',
            itemHeight: 32, // Default height for list items
            buttons: [],
            ...options
        };

        this.itemHeight = this.options.itemHeight;

        // Build UI
        this.root = document.createElement('div');
        this.root.className = `${this.options.className}-container`;

        const searchWrapper = document.createElement('div');
        searchWrapper.className = `${this.options.className}-search-wrapper`;

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search animations...';
        this.searchInput.className = `${this.options.className}-search-input`;
        this.searchInput.addEventListener('input', () => this.handleSearch());

        this.countLabel = document.createElement('span');
        this.countLabel.className = `${this.options.className}-count-label`;
        this.countLabel.textContent = '0/0';

        searchWrapper.appendChild(this.searchInput);
        searchWrapper.appendChild(this.countLabel);
        this.root.appendChild(searchWrapper);

        this.listContainer = document.createElement('div');
        this.listContainer.className = `${this.options.className}-list-container`;
        this.listContainer.addEventListener('scroll', () => this.handleScroll());

        this.spacer = document.createElement('div');
        this.spacer.className = `${this.options.className}-spacer`;
        this.listContainer.appendChild(this.spacer);

        this.root.appendChild(this.listContainer);
        this.options.container.appendChild(this.root);
    }

    /**
     * Updates the data and re-renders.
     */
    public setCards(cards: CardData[]): void {
        this.allCards = cards;
        this.handleSearch(); // Applies current search filter to new cards
    }

    /**
     * Updates the buttons and re-renders.
     */
    public setButtons(buttons: AnimationLibraryButton[]): void {
        this.options.buttons = buttons;
        this.render();
    }

    private handleSearch(): void {
        const query = this.searchInput.value.toLowerCase();
        if (!query) {
            this.filteredCards = [...this.allCards];
        } else {
            this.filteredCards = this.allCards.filter(c => 
                c.name.toLowerCase().includes(query)
            );
        }
        
        // Update count label
        this.countLabel.textContent = `${this.filteredCards.length}/${this.allCards.length}`;

        // Update spacer height
        this.spacer.style.height = `${this.filteredCards.length * this.itemHeight}px`;
        this.listContainer.scrollTop = 0;
        this.render();
    }

    private handleScroll(): void {
        const scrollTop = this.listContainer.scrollTop;
        // Only re-render if we scrolled enough to potentially change visible items
        if (Math.abs(scrollTop - this.lastScrollTop) > this.itemHeight) {
            this.lastScrollTop = scrollTop;
            this.render();
        }
    }

    private render(): void {
        const scrollTop = this.listContainer.scrollTop;
        const viewportHeight = this.listContainer.clientHeight;
        
        const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferCount);
        const endIndex = Math.min(this.filteredCards.length, Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + this.bufferCount);

        // Clear only non-spacer elements
        const currentItems = Array.from(this.listContainer.querySelectorAll(`.${this.options.className}-item`));
        currentItems.forEach(item => item.remove());

        for (let i = startIndex; i < endIndex; i++) {
            const card = this.filteredCards[i];
            const itemEl = this.createItemElement(card, i);
            itemEl.style.top = `${i * this.itemHeight}px`;

            // Apply active class if this is the selected animation
            if (this.selectedAnimPath && card.data?.animPath === this.selectedAnimPath) {
                itemEl.classList.add(`${this.options.className}-item-active`);
            }

            this.listContainer.appendChild(itemEl);
        }
    }

    private createItemElement(card: CardData, index: number): HTMLElement {
        const { className } = this.options;
        const el = document.createElement('div');
        el.className = `${className}-item`;
        el.style.height = `${this.itemHeight}px`;
        el.style.position = 'absolute';
        el.style.width = '100%';

        const nameEl = document.createElement('span');
        nameEl.className = `${className}-item-name`;
        nameEl.textContent = card.name;

        el.appendChild(nameEl);

        el.onclick = () => {
            this.selectedAnimPath = card.data?.animPath || null;

            this.emit('cardClick', {
                card,
                element: el,
                index,
                library: this
            });
            
            // Highlight selected immediately
            const active = this.listContainer.querySelector(`.${className}-item-active`);
            if (active) active.classList.remove(`${className}-item-active`);
            el.classList.add(`${className}-item-active`);
        };

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = `${className}-item-buttons`;

        if (this.options.buttons) {
            this.options.buttons.forEach(btn => {
                const btnEl = document.createElement('button');
                btnEl.className = `${className}-item-button`;
                btnEl.innerHTML = btn.icon;
                btnEl.title = btn.title;
                btnEl.onclick = (e) => {
                    e.stopPropagation();
                    btn.onClick({
                        card,
                        element: el,
                        index,
                        library: this
                    });
                };
                buttonsContainer.appendChild(btnEl);
            });
        }

        el.appendChild(buttonsContainer);

        return el;
    }

    public on(event: AnimationLibraryEvent, handler: AnimationLibraryEventHandler): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event)?.push(handler);
    }

    private emit(event: AnimationLibraryEvent, ctx: AnimationLibraryContext): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(h => h(ctx));
        }
    }

    public getElement(): HTMLElement {
        return this.root;
    }
}
