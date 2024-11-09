const { JSDOM } = require('jsdom');

function parseHtml(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const Node = dom.window.Node; // Add this line to access Node object

    function processNode(node) {
        let text = '';
        if (node.nodeType === Node.TEXT_NODE) {
            // Normalize whitespace and convert to single space
            const trimmedText = node.textContent.replace(/\s+/g, ' ').trim();
            if (trimmedText) {
                text += `[${trimmedText}]`;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'BR') {
                text += '\n';
            } else if (!['SCRIPT', 'STYLE'].includes(node.tagName)) {
                const attributes = {};
                const specifiedAttributes = ['href', 'alt', 'title', 'type', 'role', 'value', 'src', 'name', 'placeholder', 'aria-label', 'hidden'];
                const eventAttributes = ['onclick', 'onmousedown', 'onmouseup', 'onkeydown', 'onkeyup'];

                specifiedAttributes.forEach(attr => {
                    if (node.hasAttribute(attr)) {
                        attributes[attr] = node.getAttribute(attr);
                    }
                });

                eventAttributes.forEach(attr => {
                    if (node.hasAttribute(attr)) {
                        attributes[attr] = true;
                    }
                });

                const childTexts = Array.from(node.childNodes).map(processNode).join('');
                if (childTexts || Object.keys(attributes).length > 0) {
                    let attributeString = '';
                    if (Object.keys(attributes).length > 0) {
                        attributeString = `{${Object.entries(attributes).map(([key, value]) => `${key}:"${value}"`).join(', ')}}`;
                    }
                    const specialTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'DETAILS', 'SUMMARY', 'B', 'I', 'U', 'IMG', 'VIDEO', 'AUDIO', 'NAV', 'ARTICLE', 'ASIDE', 'FOOTER', 'HEADER', 'SECTION', 'LABEL', 'FIGURE', 'FIGCAPTION', 'MAIN', 'MARK', 'TIME', 'CODE', 'PRE'];
                    const tagString = specialTags.includes(node.tagName) ? `{tagName:"${node.tagName.toLowerCase()}"}` : '';
                    text += `\n${childTexts}${tagString}${attributeString}\n`;
                }
            }
        }
        return text;
    }

    let processedText = '';
    if (document.head) {
        const titleElement = document.head.querySelector('title');
        if (titleElement) {
            processedText += `[${titleElement.textContent}]{tag:"title"}\n`;
        }
        const metaElements = document.head.querySelectorAll('meta[name][content]');
        metaElements.forEach(meta => {
            processedText += `[${meta.getAttribute('content')}]{tag:"meta", name:"${meta.getAttribute('name')}"}\n`;
        });
        processedText += '\n';
    }
    processedText += processNode(document.body);
    return processedText;
}

module.exports = {parseHtml};