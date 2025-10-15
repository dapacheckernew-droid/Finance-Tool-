const AttachmentsUI = (() => {
    const render = (state) => {
        const grid = document.getElementById('attachmentsGrid');
        const query = document.getElementById('attachmentSearch').value?.toLowerCase() || '';
        const attachments = state.attachments.filter(attachment => attachment.name.toLowerCase().includes(query));
        grid.innerHTML = attachments.map(attachment => {
            const source = Utils.decompressFromBase64(attachment.dataUrl);
            const preview = attachment.type.startsWith('image/') ? `<img src="${source}" alt="${attachment.name}">` : `<div class="badge">${attachment.type}</div>`;
            return `<div class="attachment-card">
                <h4>${attachment.name}</h4>
                ${preview}
                <small>${(attachment.size / 1024).toFixed(1)} KB</small>
                <button class="btn secondary" data-open-attachment="${attachment.id}">Open</button>
            </div>`;
        }).join('');
        bindOpen(state);
    };

    const bindOpen = (state) => {
        document.querySelectorAll('[data-open-attachment]').forEach(button => {
            button.addEventListener('click', () => {
                const attachment = state.attachments.find(a => a.id === button.dataset.openAttachment);
                if (!attachment) return;
                const link = document.createElement('a');
                link.href = Utils.decompressFromBase64(attachment.dataUrl);
                link.download = attachment.name;
                link.click();
            });
        });
    };

    const bindSearch = () => {
        const input = document.getElementById('attachmentSearch');
        if (!input) return;
        input.addEventListener('input', Utils.debounce(() => render(App.state), 200));
    };

    bindSearch();

    return { render };
})();
