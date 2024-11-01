// Função para carregar os contatos do LocalStorage e exibi-los como links
function loadContacts() {
    const chatList = document.getElementById("chat-list");
    chatList.innerHTML = ""; // Limpa a lista antes de carregar
    
    // Obtém os contatos do LocalStorage (ou um array vazio se não houver contatos)
    const contacts = JSON.parse(localStorage.getItem("contacts")) || [];

    // Adiciona cada contato na lista de chats
    contacts.forEach((contact, index) => {
        const chatDiv = document.createElement("div");
        chatDiv.classList.add("chat");

        chatDiv.innerHTML = `
            <img src="https://poloshoppingindaiatuba.com.br/assets/images/732e11da931f0081ab573c6bf3f38459.jpg" alt="User">
            <div class="chat-info">
                <h2>Contato ${index + 1}</h2>
                <p><a href="https://wa.me/${contact}" target="_blank">Número: ${contact}</a></p>
            </div>
            <span class="time">Agora</span>
        `;
        chatList.appendChild(chatDiv);
    });
}

// Função para adicionar um novo contato e salvar no LocalStorage
function addContact() {
    const phoneInput = document.getElementById("phone-input");
    const phoneNumber = phoneInput.value.trim();

    if (phoneNumber) {
        // Obtém os contatos existentes do LocalStorage
        const contacts = JSON.parse(localStorage.getItem("contacts")) || [];
        
        // Adiciona o novo contato na lista
        contacts.push(phoneNumber);

        // Salva a lista atualizada no LocalStorage
        localStorage.setItem("contacts", JSON.stringify(contacts));

        // Limpa o input e recarrega a lista de contatos
        phoneInput.value = "";
        loadContacts();

        // Redireciona para o WhatsApp com o número adicionado
        window.open(`https://wa.me/${phoneNumber}`, '_blank');
    } else {
        alert("Por favor, insira um número de telefone.");
    }
}

// Carrega os contatos ao iniciar a página
window.onload = loadContacts;
