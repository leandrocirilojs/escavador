document.querySelectorAll('.footer-icon').forEach(icon => {
    icon.addEventListener('click', () => {
        document.querySelectorAll('.footer-icon').forEach(item => item.classList.remove('active'));
        icon.classList.add('active');
    });
});

//abrir zap

function openWhatsApp() {
    const phoneInput = document.getElementById('phone-input').value;
    const formattedNumber = phoneInput.replace(/\D/g, ''); // Remove todos os caracteres não numéricos

    if (formattedNumber) {
        const whatsappURL = `https://wa.me/${formattedNumber}`;
        window.open(whatsappURL, '_blank'); // Abre o WhatsApp em uma nova aba
    } else {
        alert("Por favor, digite um número de telefone válido.");
    }
}
