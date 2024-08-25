class Knob {
// ... (other methods remain the same)

private compile(): (data: TemplateData) => string {
const regex = /{{{\s*(.*?)\s*}}}|\{\{#each\s+(._?)\s+as\s+\|(._?)\|\}\}|\{\{\/each\}\}|\{%\s*(#?.*?)\s*%\}|{{\s*(._?)\s_}}/g;

    const segments: (string | ((data: TemplateData) => string))[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(this.template)) !== null) {
      segments.push(this.template.slice(lastIndex, match.index));

      if (match[1]) {
        // Handle partials
        segments.push(this.createPartialGetter(match[1].trim()));
      } else if (match[2] && match[3]) {
        // Handle new each syntax
        segments.push(this.createEachHandler(match[2].trim(), match[3].trim()));
      } else if (match[4]) {
        // Handle other control structures (if, for)
        segments.push(this.createControlStructure(match[4].trim()));
      } else if (match[5]) {
        // Handle variable interpolation
        segments.push(this.createValueGetter(match[5].trim()));
      }
      lastIndex = regex.lastIndex;
    }

    segments.push(this.template.slice(lastIndex));

    return (data: TemplateData) =>
      segments
        .map((segment) =>
          typeof segment === 'function' ? segment(data) : segment
        )
        .join('');

}

private createEachHandler(
iterableExpression: string,
itemName: string
): (data: TemplateData) => string {
return (data: TemplateData) => {
const items = this.getValueFromData(iterableExpression, data);
if (!items || !Array.isArray(items)) return '';

      const eachBlockContent = this.extractEachBlockContent(iterableExpression, itemName);

      return items
        .map((item, index) => {
          const itemData = {
            ...data,
            [itemName]: item,
            [`${itemName}_index`]: index,
          };
          return this.renderContent(eachBlockContent, itemData);
        })
        .join('');
    };

}

// ... (other methods remain the same)
}
