import { MarkdownRenderChild } from 'obsidian';

// Share ownership across reprocessing of the same edit button, retaining one handler.
const editHandlers = new WeakMap<Node, EventListener>();

export class OverviewBlockLifecycle extends MarkdownRenderChild {
	disposed = false;

	constructor(el: HTMLElement, onEdit: () => void) {
		super(el);
		let editButton: Node | null | undefined;
		const onClick: EventListener = (event): void => {
			event.stopImmediatePropagation();
			event.preventDefault();
			event.stopPropagation();
			onEdit();
		};
		const unbind = (): void => {
			if (!editButton) return;
			editButton.removeEventListener('click', onClick, true);
			if (editHandlers.get(editButton) === onClick) editHandlers.delete(editButton);
		};
		const bind = (): void => {
			if (this.disposed) return;
			const nextButton = el.parentElement?.childNodes.item(1);
			if (nextButton === editButton) return;
			unbind();
			editButton = nextButton;
			if (!editButton) return;
			const previous = editHandlers.get(editButton);
			if (previous) editButton.removeEventListener('click', previous, true);
			editHandlers.set(editButton, onClick);
			editButton.addEventListener('click', onClick, { capture: true });
		};
		const observer = new MutationObserver(bind);
		this.register(() => {
			this.disposed = true;
			observer.disconnect();
			unbind();
			editButton = undefined;
		});
		observer.observe(el, { childList: true, subtree: true });
		bind();
	}
}
