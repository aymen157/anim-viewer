import type { AnimationLibraryButton, AnimationLibraryContext } from './AnimationLibrary';
import './AddonShelf.css';
declare var ace: any;
import { 
    Folder, 
    FileText, 
    Play, 
    Terminal, 
    RefreshCw, 
    ExternalLink, 
    Star, 
    Settings, 
    Code, 
    Cpu, 
    Database, 
    Activity,
    type IconNode
} from 'lucide';

export interface AddonShelfOptions {
    container: HTMLElement;
    onButtonsChanged: (buttons: AnimationLibraryButton[]) => void;
}

export interface SavedAddonButton {
    id: string;
    title: string;
    icon: string;
    scriptText: string;
}

export function renderLucideIcon(iconNode: IconNode, size = 14): string {
    const children = iconNode.map(([tag, attrs]) => {
        const attrStr = Object.entries(attrs)
            .map(([k, v]) => `${k}="${v}"`)
            .join(' ');
        return `<${tag} ${attrStr}></${tag}>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

const LOCAL_STORAGE_KEY = 'anim-viewer:addon-buttons';

export const PRESET_ICONS = [
    { name: 'Folder', svg: renderLucideIcon(Folder) },
    { name: 'File', svg: renderLucideIcon(FileText) },
    { name: 'Play', svg: renderLucideIcon(Play) },
    { name: 'Terminal', svg: renderLucideIcon(Terminal) },
    { name: 'Reload', svg: renderLucideIcon(RefreshCw) },
    { name: 'Link', svg: renderLucideIcon(ExternalLink) },
    { name: 'Star', svg: renderLucideIcon(Star) },
    { name: 'Settings', svg: renderLucideIcon(Settings) },
    { name: 'Code', svg: renderLucideIcon(Code) },
    { name: 'Cpu', svg: renderLucideIcon(Cpu) },
    { name: 'Database', svg: renderLucideIcon(Database) },
    { name: 'Activity', svg: renderLucideIcon(Activity) }
];

const DEFAULT_SCRIPT_TEMPLATE = `// Write custom action when this button is clicked
// 'ctx' provides the card context
// 'API' provides backend filesystem functions

const { animPath } = ctx.card.data;
console.log("Clicked:", ctx.card.name);

if (animPath) {
    API.openFolder(animPath);
}
`;

export class AddonShelf {
    private options: AddonShelfOptions;
    private root: HTMLDivElement;
    private savedButtons: SavedAddonButton[] = [];
    
    // UI Elements
    private listContainer: HTMLDivElement;
    private countBadge: HTMLSpanElement;
    private formPanel: HTMLDivElement;
    private addonListWrapper: HTMLDivElement;
    
    // Form Elements
    private formTitle: HTMLHeadingElement;
    private titleInput: HTMLInputElement;
    private scriptInput: HTMLTextAreaElement | null = null;
    private customSvgInput: HTMLTextAreaElement;
    private presetGrid: HTMLDivElement;
    private aceEditor: any = null;
    
    // State
    private editingButtonId: string | null = null;
    private selectedIconSvg: string = PRESET_ICONS[0].svg;

    constructor(options: AddonShelfOptions) {
        this.options = options;
        this.savedButtons = AddonShelf.loadButtons();
        
        // Build Main Container
        this.root = document.createElement('div');
        this.root.className = 'addon-shelf-container';
        
        this.buildHeader();
        this.buildMainContent();
        this.buildFormPanel();
        
        this.options.container.appendChild(this.root);
        this.render();
    }

    public static loadButtons(): SavedAddonButton[] {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Failed to load custom addon buttons:', e);
            return [];
        }
    }

    public static compileButtons(savedButtons: SavedAddonButton[]): AnimationLibraryButton[] {
        return savedButtons.map(saved => ({
            icon: saved.icon,
            title: saved.title,
            onClick: (ctx: AnimationLibraryContext) => {
                try {
                    const fn = new Function('ctx', 'API', saved.scriptText);
                    fn(ctx, (window as any).API);
                } catch (err) {
                    console.error(`Error in addon button "${saved.title}":`, err);
                    alert(`Error in addon script "${saved.title}":\n${(err as Error).message}`);
                }
            }
        }));
    }

    private buildHeader(): void {
        const header = document.createElement('div');
        header.className = 'addon-shelf-header';

        const titleGroup = document.createElement('div');
        titleGroup.className = 'addon-shelf-title-group';

        const title = document.createElement('h3');
        title.textContent = 'ADDON SHELF';

        this.countBadge = document.createElement('span');
        this.countBadge.className = 'addon-shelf-count-badge';
        this.countBadge.textContent = '0';

        titleGroup.appendChild(title);
        titleGroup.appendChild(this.countBadge);

        const addButton = document.createElement('button');
        addButton.className = 'addon-shelf-add-btn';
        addButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Addon
        `;
        addButton.onclick = () => this.showForm();

        header.appendChild(titleGroup);
        header.appendChild(addButton);
        this.root.appendChild(header);
    }

    private buildMainContent(): void {
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'addon-shelf-list-container';

        this.addonListWrapper = document.createElement('div');
        this.addonListWrapper.className = 'addon-shelf-list-wrapper';

        this.listContainer.appendChild(this.addonListWrapper);
        this.root.appendChild(this.listContainer);
    }

    private buildFormPanel(): void {
        this.formPanel = document.createElement('div');
        this.formPanel.className = 'addon-shelf-form-panel';

        this.formTitle = document.createElement('h4');
        this.formTitle.textContent = 'Create Addon Button';
        this.formPanel.appendChild(this.formTitle);

        // Title Field
        const titleField = this.createFormField('Button Title', 'addon-btn-title-field');
        this.titleInput = document.createElement('input');
        this.titleInput.type = 'text';
        this.titleInput.placeholder = 'e.g., Export Selected';
        this.titleInput.className = 'addon-shelf-input';
        titleField.appendChild(this.titleInput);
        this.formPanel.appendChild(titleField);

        // Icon Field (Presets & Custom)
        const iconField = this.createFormField('Select Icon', 'addon-btn-icon-field');
        
        this.presetGrid = document.createElement('div');
        this.presetGrid.className = 'addon-shelf-preset-grid';
        iconField.appendChild(this.presetGrid);

        this.customSvgInput = document.createElement('textarea');
        this.customSvgInput.placeholder = 'Or paste custom SVG markup...';
        this.customSvgInput.className = 'addon-shelf-textarea addon-shelf-svg-textarea';
        this.customSvgInput.rows = 2;
        this.customSvgInput.oninput = () => {
            this.selectedIconSvg = this.customSvgInput.value.trim() || PRESET_ICONS[0].svg;
            this.updatePresetActiveStates(null);
        };
        
        iconField.appendChild(this.customSvgInput);
        this.formPanel.appendChild(iconField);

        // Script Field
        const scriptField = this.createFormField('Button Script (JavaScript)', 'addon-btn-script-field');
        
        const editorContainer = document.createElement('div');
        editorContainer.className = 'addon-shelf-editor-container';
        editorContainer.style.height = '200px';
        editorContainer.style.position = 'relative';
        editorContainer.style.borderRadius = '4px';
        editorContainer.style.border = '1px solid #333';
        editorContainer.style.overflow = 'hidden';
        
        scriptField.appendChild(editorContainer);
        this.formPanel.appendChild(scriptField);

        if (typeof ace !== 'undefined') {
            ace.config.set("basePath", "https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.7/");
            
            const aceEl = document.createElement('div');
            aceEl.style.width = '100%';
            aceEl.style.height = '100%';
            editorContainer.appendChild(aceEl);
            
            this.aceEditor = ace.edit(aceEl);
            this.aceEditor.setTheme("ace/theme/tomorrow_night_eighties");
            this.aceEditor.session.setMode("ace/mode/javascript");
            this.aceEditor.session.setUseWorker(false); // disable worker to prevent cross-origin issues
            this.aceEditor.setOptions({
                fontSize: "12px",
                fontFamily: "JetBrains Mono, Monaco, Consolas, monospace",
                showPrintMargin: false,
                highlightActiveLine: true,
                tabSize: 4,
                useSoftTabs: true
            });
        } else {
            this.scriptInput = document.createElement('textarea');
            this.scriptInput.placeholder = 'Write JavaScript here...';
            this.scriptInput.className = 'addon-shelf-textarea addon-shelf-script-textarea';
            this.scriptInput.style.width = '100%';
            this.scriptInput.style.height = '100%';
            this.scriptInput.style.border = 'none';
            this.scriptInput.style.margin = '0';
            this.scriptInput.style.boxSizing = 'border-box';
            this.scriptInput.style.resize = 'none';
            editorContainer.appendChild(this.scriptInput);
        }

        // Helper Documentation
        const docs = document.createElement('div');
        docs.className = 'addon-shelf-docs';
        docs.innerHTML = `
            <h5>SCRIPT CONTEXT HELP</h5>
            <ul>
                <li><code>ctx.card.name</code>: Name of current animation</li>
                <li><code>ctx.card.data.animPath</code>: Full path to animation FBX</li>
                <li><code>ctx.card.data.manifestPath</code>: Full path to manifest JSON</li>
                <li><code>API</code>: Exposes backend helpers (e.g. <code>API.openFolder(path)</code>)</li>
            </ul>
        `;
        this.formPanel.appendChild(docs);

        // Form Actions
        const actions = document.createElement('div');
        actions.className = 'addon-shelf-form-actions';

        const saveButton = document.createElement('button');
        saveButton.className = 'addon-shelf-btn-save';
        saveButton.textContent = 'Save Addon';
        saveButton.onclick = () => this.handleSave();

        const cancelButton = document.createElement('button');
        cancelButton.className = 'addon-shelf-btn-cancel';
        cancelButton.textContent = 'Cancel';
        cancelButton.onclick = () => this.hideForm();

        actions.appendChild(saveButton);
        actions.appendChild(cancelButton);
        this.formPanel.appendChild(actions);

        this.root.appendChild(this.formPanel);
        this.buildPresetGrid();
    }

    private createFormField(labelText: string, id: string): HTMLDivElement {
        const field = document.createElement('div');
        field.className = `addon-shelf-field ${id}`;
        
        const label = document.createElement('label');
        label.textContent = labelText;
        field.appendChild(label);
        
        return field;
    }

    private buildPresetGrid(): void {
        this.presetGrid.innerHTML = '';
        PRESET_ICONS.forEach((preset, index) => {
            const btn = document.createElement('button');
            btn.className = 'addon-shelf-preset-btn';
            btn.type = 'button';
            btn.innerHTML = preset.svg;
            btn.title = preset.name;
            btn.onclick = () => {
                this.selectedIconSvg = preset.svg;
                this.customSvgInput.value = '';
                this.updatePresetActiveStates(index);
            };
            if (preset.svg === this.selectedIconSvg) {
                btn.classList.add('active');
            }
            this.presetGrid.appendChild(btn);
        });
    }

    private updatePresetActiveStates(activeIndex: number | null): void {
        const buttons = this.presetGrid.querySelectorAll('.addon-shelf-preset-btn');
        buttons.forEach((btn, idx) => {
            if (activeIndex !== null && idx === activeIndex) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    private showForm(addon?: SavedAddonButton): void {
        if (addon) {
            this.editingButtonId = addon.id;
            this.formTitle.textContent = 'Edit Addon Button';
            this.titleInput.value = addon.title;
            
            if (this.aceEditor) {
                this.aceEditor.setValue(addon.scriptText, -1);
            } else if (this.scriptInput) {
                this.scriptInput.value = addon.scriptText;
            }
            
            // Check if icon is preset
            const presetIdx = PRESET_ICONS.findIndex(p => p.svg === addon.icon);
            if (presetIdx !== -1) {
                this.selectedIconSvg = addon.icon;
                this.customSvgInput.value = '';
                this.updatePresetActiveStates(presetIdx);
            } else {
                this.selectedIconSvg = addon.icon;
                this.customSvgInput.value = addon.icon;
                this.updatePresetActiveStates(null);
            }
        } else {
            this.editingButtonId = null;
            this.formTitle.textContent = 'Create Addon Button';
            this.titleInput.value = '';
            
            if (this.aceEditor) {
                this.aceEditor.setValue(DEFAULT_SCRIPT_TEMPLATE, -1);
            } else if (this.scriptInput) {
                this.scriptInput.value = DEFAULT_SCRIPT_TEMPLATE;
            }
            this.selectedIconSvg = PRESET_ICONS[0].svg;
            this.customSvgInput.value = '';
            this.updatePresetActiveStates(0);
        }

        this.formPanel.classList.add('visible');
        this.listContainer.classList.add('form-open');
        this.titleInput.focus();
    }

    private hideForm(): void {
        this.formPanel.classList.remove('visible');
        this.listContainer.classList.remove('form-open');
        this.editingButtonId = null;
    }

    private handleSave(): void {
        const title = this.titleInput.value.trim();
        const script = this.aceEditor ? this.aceEditor.getValue().trim() : (this.scriptInput ? this.scriptInput.value.trim() : '');
        const icon = this.selectedIconSvg.trim();

        if (!title) {
            alert('Please enter a button title.');
            return;
        }

        if (!script) {
            alert('Please enter a script block.');
            return;
        }

        if (!icon) {
            alert('Please select or specify an icon.');
            return;
        }

        if (this.editingButtonId) {
            // Edit mode
            const index = this.savedButtons.findIndex(b => b.id === this.editingButtonId);
            if (index !== -1) {
                this.savedButtons[index] = {
                    id: this.editingButtonId,
                    title,
                    icon,
                    scriptText: script
                };
            }
        } else {
            // Create mode
            const newAddon: SavedAddonButton = {
                id: 'addon_' + Math.random().toString(36).substr(2, 9),
                title,
                icon,
                scriptText: script
            };
            this.savedButtons.push(newAddon);
        }

        this.saveAndNotify();
        this.hideForm();
        this.render();
    }

    private handleDelete(id: string): void {
        const item = this.savedButtons.find(b => b.id === id);
        if (!item) return;

        if (confirm(`Are you sure you want to delete the "${item.title}" addon button?`)) {
            this.savedButtons = this.savedButtons.filter(b => b.id !== id);
            this.saveAndNotify();
            this.render();
        }
    }

    private saveAndNotify(): void {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.savedButtons));
            
            // Compile buttons to trigger callback
            const compiled = AddonShelf.compileButtons(this.savedButtons);
            this.options.onButtonsChanged(compiled);
        } catch (e) {
            console.error('Failed to save addon buttons:', e);
        }
    }

    private render(): void {
        this.countBadge.textContent = this.savedButtons.length.toString();
        this.addonListWrapper.innerHTML = '';

        if (this.savedButtons.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'addon-shelf-empty-state';
            emptyState.innerHTML = `
                <div class="addon-shelf-empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                </div>
                <div class="addon-shelf-empty-title">No Addon Buttons Yet</div>
                <p>Create a custom action button to perform operations directly on your animation assets.</p>
            `;
            emptyState.onclick = () => this.showForm();
            this.addonListWrapper.appendChild(emptyState);
            return;
        }

        this.savedButtons.forEach(btn => {
            const row = document.createElement('div');
            row.className = 'addon-shelf-row';

            const iconCol = document.createElement('div');
            iconCol.className = 'addon-shelf-row-icon';
            iconCol.innerHTML = btn.icon;

            const infoCol = document.createElement('div');
            infoCol.className = 'addon-shelf-row-info';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'addon-shelf-row-title';
            titleSpan.textContent = btn.title;

            const badge = document.createElement('span');
            badge.className = 'addon-shelf-row-badge';
            badge.textContent = 'Custom JS';

            infoCol.appendChild(titleSpan);
            infoCol.appendChild(badge);

            const actionsCol = document.createElement('div');
            actionsCol.className = 'addon-shelf-row-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'addon-shelf-row-btn edit';
            editBtn.title = 'Edit script';
            editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
            editBtn.onclick = () => this.showForm(btn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'addon-shelf-row-btn delete';
            deleteBtn.title = 'Delete addon';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
            deleteBtn.onclick = () => this.handleDelete(btn.id);

            actionsCol.appendChild(editBtn);
            actionsCol.appendChild(deleteBtn);

            row.appendChild(iconCol);
            row.appendChild(infoCol);
            row.appendChild(actionsCol);

            this.addonListWrapper.appendChild(row);
        });
    }
}
