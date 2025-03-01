import { setIcon } from 'obsidian';
import { CustomEventEmitter } from './EventEmitter';

export class ListComponent {
	emitter: CustomEventEmitter;
	containerEl: HTMLElement;
	controlEl: HTMLElement;
	emptyStateEl: HTMLElement;
	listEl: HTMLElement;
	values: string[];
	defaultValues: string[];
	constructor(containerEl: HTMLElement, values: string[] = [], defaultValues: string[] = []) {
		this.emitter = new CustomEventEmitter();
		this.containerEl = containerEl;
		this.controlEl = containerEl.querySelector('.setting-item-control') || containerEl;
		this.listEl = this.controlEl.createDiv('setting-command-hotkeys');
		this.addResetButton();
		this.setValues(values);
		this.defaultValues = defaultValues;
	}

	on(event: string, listener: (data?: any) => void) {
		this.emitter.on(event, listener);
	}

	off(event: string, listener: (data?: any) => void) {
		this.emitter.off(event, listener);
	}

	private emit(event: string, data?: any) {
		this.emitter.emit(event, data);
	}

	setValues(values: string[]) {
		this.removeElements();
		this.values = values;
		if (values.length !== 0) {
			values.forEach((value) => {
				this.addElement(value);
			});
		}
		this.emit('update', this.values);
	}

	removeElements() {
		this.listEl.empty();
	}

	addElement(value: string) {
		this.listEl.createSpan('setting-hotkey', (span) => {
			if (value.toLocaleLowerCase() === 'md') {
				span.innerText = 'markdown';
			} else {
				span.innerText = value;
			}
			span.setAttribute('extension', value);
			const removeSpan = span.createEl('span', { cls: 'ofn-list-item-remove setting-hotkey-icon' });
			const svgElement = removeSpan.createEl('span', { cls: 'ofn-list-item-remove-icon' });
			setIcon(svgElement, 'x');
			removeSpan.onClickEvent((e) => {
				this.removeValue(value);
				span.remove();
			});
		});
	}

	async addValue(value: string) {
		this.values.push(value);
		this.addElement(value);
		this.emit('add', value);
		this.emit('update', this.values);
	}

	addResetButton() {
		const resetButton = this.controlEl.createEl('span', { cls: 'clickable-icon setting-restore-hotkey-button' });
		setIcon(resetButton, 'rotate-ccw');
		resetButton.onClickEvent((e) => {
			this.setValues(this.defaultValues);
		});
		return this;
	}

	removeValue(value: string) {
		this.values = this.values.filter((v) => v !== value);
		this.listEl.find(`[extension='${value}']`).remove();
		this.emit('remove', value);
		this.emit('update', this.values);
	}
}
