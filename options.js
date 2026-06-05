const defaults = { timerDelay: 3, exportFormat: 'png', lineWidth: 4, jpegQuality: 90 };

function initRadioGroup(groupId, storageKey, val) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.radio-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.val === String(val));
        opt.addEventListener('click', () => {
            group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
    });
}

function getRadioVal(groupId) {
    const active = document.querySelector(`#${groupId} .radio-option.active`);
    return active ? active.dataset.val : null;
}

function initSlider(id, valId, stored) {
    const el = document.getElementById(id);
    const lbl = document.getElementById(valId);
    el.value = stored;
    lbl.textContent = stored;
    el.addEventListener('input', () => { lbl.textContent = el.value; });
}

chrome.storage.sync.get(defaults, (prefs) => {
    initRadioGroup('timerGroup', 'timerDelay', prefs.timerDelay);
    initRadioGroup('formatGroup', 'exportFormat', prefs.exportFormat);
    initSlider('lineWidth', 'lwVal', prefs.lineWidth);
    initSlider('jpegQuality', 'qualVal', prefs.jpegQuality);
});

document.getElementById('saveBtn').addEventListener('click', () => {
    const prefs = {
        timerDelay: Number(getRadioVal('timerGroup') || 3),
        exportFormat: getRadioVal('formatGroup') || 'png',
        lineWidth: Number(document.getElementById('lineWidth').value),
        jpegQuality: Number(document.getElementById('jpegQuality').value)
    };
    chrome.storage.sync.set(prefs, () => {
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    });
});
