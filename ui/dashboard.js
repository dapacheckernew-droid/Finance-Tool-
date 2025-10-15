const DashboardUI = (() => {
    const render = (state) => {
        ReportsUI.renderDashboardKPIs(state);
        renderAttachmentPreview(state.attachments);
    };

    const renderAttachmentPreview = (attachments) => {
        const preview = document.getElementById('attachmentPreview');
        const recent = attachments.slice(-3).reverse();
        preview.innerHTML = recent.length === 0 ? '<p>No attachments yet.</p>' : recent.map(attachment => {
            const source = Utils.decompressFromBase64(attachment.dataUrl);
            const display = attachment.type.startsWith('image/') ? `<img src="${source}" alt="${attachment.name}">` : `<span class="badge">${attachment.type}</span>`;
            return `<div class="attachment-card"><h4>${attachment.name}</h4>${display}<small>${new Date(attachment.createdAt).toLocaleString()}</small></div>`;
        }).join('');
    };

    return { render };
})();
