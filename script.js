document.querySelectorAll('.footer-icon').forEach(icon => {
    icon.addEventListener('click', () => {
        document.querySelectorAll('.footer-icon').forEach(item => item.classList.remove('active'));
        icon.classList.add('active');
    });
});
