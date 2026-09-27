export interface ToolFaq {
	q: string;
	a: string;
}

export interface ToolCopy {
	title: string;
	intro: string;
	detail: string;
	tip: string;
	faqs: ToolFaq[];
	/** Overrides the generic "Convert from {name}" heading on hub pages. */
	hubFromTitle?: string;
	hubToTitle?: string;
}

export interface SeoCopy {
	home: string;
	description: string;
	directory: string;
	guide: string;
	notes: string;
	related: string;
	languages: string;
	faq: string;
	hubFrom: string;
	hubTo: string;
	otherConverters: string;
	formatGuides: string;
	picker: {
		from: string;
		to: string;
		browse: string;
		toControl: string;
	};
	groups: Record<string, string>;
	steps: string[];
	stepsHub: string[];
	pages: Record<string, [string, string]>;
	tools: Record<string, ToolCopy>;
}
