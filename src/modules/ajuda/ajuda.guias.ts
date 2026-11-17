/*
 * Os tutoriais do app — módulo NEUTRO (sem `server-only`), porque o botão "?"
 * e a tela de Tutoriais são Client Components.
 *
 * No app antigo eram 13 guias (`viewTutoriais`), e o João sentiu falta deles
 * (17/11). Não foram copiados: as telas mudaram (estoque só entra pela compra,
 * a devolução acerta o dinheiro sozinha, o comprovante pode vir depois,
 * perfumaria e decant). Cada passo foi reescrito olhando a tela de hoje.
 *
 * Acrescentar um guia é acrescentar um objeto aqui: o "?" de cada tela e a
 * tela de Tutoriais se servem da mesma lista.
 */

export const GRUPOS = [
  { id: "primeiros", nome: "Primeiros passos", desc: "Como o app pensa e o que fazer primeiro." },
  { id: "dia", nome: "O dia a dia", desc: "O que se repete toda semana." },
  { id: "problema", nome: "Quando dá problema", desc: "Alguma coisa não bate ou saiu errado." },
] as const;

export type Grupo = (typeof GRUPOS)[number]["id"];

export type Guia = {
  id: string;
  grupo: Grupo;
  titulo: string;
  resumo: string;
  passos: string[];
  /** "Abrir esta tela": aonde o guia leva. */
  ir?: { href: string; rotulo: string };
};

export const GUIAS = [
  {
    id: "custo-preco",
    grupo: "primeiros",
    titulo: "Custo e preço sugerido",
    resumo: "Código × multiplicador, valor pago e a regra de cada linha",
    passos: [
      "Cada produto é de uma linha: Semijoias, Perfumaria ou Outros. Cada linha tem a sua regra em Ajustes.",
      "Custo é quanto a loja pagou. Semijoia chega com o código do fornecedor: código × multiplicador = custo. Com 2,9, o código 35 dá R$ 101,50.",
      "Perfume não vem com código: no cadastro, escolha “Valor pago” e digite quanto pagou por unidade.",
      "Preço sugerido sai do custo pela regra da linha: multiplicando (custo × 2) ou somando um percentual (custo + 60%). Com 0, a sugestão fica desligada e você digita o preço.",
      "O preço sugerido aparece preenchido no cadastro, e dá para trocar. O preço final ainda pode mudar na venda.",
      "Mudar a regra em Ajustes não recalcula os produtos já cadastrados: o que já foi pago não muda porque a tabela mudou.",
    ],
    ir: { href: "/ajustes", rotulo: "Abrir os Ajustes" },
  },
  {
    id: "primeiro-produto",
    grupo: "primeiros",
    titulo: "Cadastrar um produto",
    resumo: "Da linha e da foto ao preço",
    passos: [
      "Estoque › Produtos › Novo produto.",
      "Escolha a linha: Semijoias, Perfumaria ou Outros. Ela decide as categorias e a palavra da etiqueta.",
      "Tire a foto: é por ela que o produto é achado rápido na hora da venda.",
      "Informe o custo: código do fornecedor × multiplicador, ou o valor pago.",
      "Dê um nome que você reconheça na prateleira, escolha a categoria e, se tiver, o tamanho (aro 17, 45 cm, 100 ml).",
      "Escolha o fornecedor e confira o preço sugerido.",
      "O produto nasce com estoque ZERO. Quem coloca produto na prateleira é a compra — veja “Dar entrada pela compra”.",
      "O código interno (LL-0001) é gerado pelo app. É ele que vai na etiqueta e no recibo.",
    ],
    ir: { href: "/estoque", rotulo: "Abrir Produtos" },
  },
  {
    id: "primeira-compra",
    grupo: "primeiros",
    titulo: "Dar entrada pela compra",
    resumo: "Fornecedor, produtos e pagamento num lugar só",
    passos: [
      "Compra e venda › Nova compra.",
      "Escolha o fornecedor.",
      "Em “Adicionar produto ou insumo”, busque cada item e informe a quantidade e o custo de cada um.",
      "Diga como vai pagar: à vista ou parcelado.",
      "Ao salvar, três coisas acontecem de uma vez: o estoque entra, o custo dos produtos é atualizado e o pagamento aparece em Financeiro › A pagar.",
      "Na ficha da compra dá para imprimir as etiquetas do que acabou de chegar.",
    ],
    ir: { href: "/compras/nova", rotulo: "Começar uma compra" },
  },
  {
    id: "primeira-venda",
    grupo: "primeiros",
    titulo: "Fazer uma venda",
    resumo: "Cliente, produtos, preço e como pagou",
    passos: [
      "Compra e venda › Nova venda.",
      "Escolha a cliente. Sem cliente a venda fica avulsa — e venda avulsa precisa sair paga, porque não haveria de quem cobrar depois.",
      "Em “Adicionar produto”, busque e toque nos produtos. Só dá para vender o que tem em estoque.",
      "Confira o preço de cada item e, se der desconto, informe.",
      "Em “Como pagou”, escolha a forma, a carteira onde o dinheiro entrou e, se quiser, anexe o comprovante.",
      "Se saiu embalagem junto (saquinho, caixinha), informe: baixa do estoque de insumos e entra no custo.",
      "Toque em “Fechar venda”. O estoque baixa e o dinheiro entra no caixa no mesmo passo.",
    ],
    ir: { href: "/vendas/nova", rotulo: "Começar uma venda" },
  },
  {
    id: "formas",
    grupo: "dia",
    titulo: "À vista, a prazo e com entrada",
    resumo: "Como as parcelas nascem",
    passos: [
      "À vista: em “Como pagou”, informe o valor inteiro numa forma (dinheiro, Pix, cartão). A venda já nasce paga.",
      "Dá para dividir: parte no Pix e parte no dinheiro, por exemplo. Cada pagamento vai para a sua carteira.",
      "A prazo: pague só uma parte (ou nada) e combine as parcelas. Precisa ter cliente escolhida.",
      "Com entrada: registre a entrada como pagamento agora e o resto em parcelas.",
      "Toda parcela em aberto aparece em Financeiro › A receber, com o vencimento de cada uma.",
    ],
    ir: { href: "/vendas/nova", rotulo: "Começar uma venda" },
  },
  {
    id: "receber",
    grupo: "dia",
    titulo: "Receber uma parcela",
    resumo: "Dar baixa e lançar no caixa",
    passos: [
      "Financeiro › A receber. A lista traz toda parcela em aberto, com o vencimento.",
      "Na linha da parcela, toque no ✓. (Também dá pela venda: “Receber pagamento”.)",
      "Confira o valor, a data e a carteira onde o dinheiro entrou. Se foi na maquininha, informe a taxa.",
      "Anexe o comprovante — ou anexe depois. Sem comprovante a baixa vale, mas o dinheiro só entra no caixa quando o comprovante chega.",
      "Dinheiro vivo dispensa comprovante: entra no caixa na hora.",
      "Recebeu errado? Na venda, “Remover o recebimento” desfaz.",
    ],
    ir: { href: "/financeiro?aba=contas&tipo=receber", rotulo: "Abrir A receber" },
  },
  {
    id: "pagar",
    grupo: "dia",
    titulo: "Contas a pagar e comprovantes",
    resumo: "Lançar, pagar e anexar o papel",
    passos: [
      "Financeiro › A pagar mostra o que vence e quando. As compras parceladas já aparecem aqui sozinhas.",
      "Conta que não veio de compra (aluguel, luz): “Nova conta a pagar”.",
      "Para pagar, toque no ✓ da conta, escolha de qual carteira o dinheiro saiu e anexe o comprovante.",
      "Pagou e ainda não tem o comprovante? Pode dar baixa. A saída só conta no caixa quando o comprovante for anexado.",
      "Os comprovantes que faltam aparecem numa lista com “Anexar”: é só tirar a foto.",
    ],
    ir: { href: "/financeiro?aba=contas&tipo=pagar", rotulo: "Abrir A pagar" },
  },
  {
    id: "orcamento",
    grupo: "dia",
    titulo: "Orçamento: gerar, revisar e converter",
    resumo: "A proposta antes de fechar",
    passos: [
      "Compra e venda › Novo orçamento.",
      "Monte igual a uma venda: cliente, produtos, preço e desconto. Diga como ela vai pagar e até quando vale.",
      "Toque em “Gerar orçamento” e mande o PDF para a cliente.",
      "Enquanto vale, os produtos ficam reservados no estoque — sem baixar. Vencido, deixa de reservar.",
      "Ela pediu mudança? Abra o orçamento e toque em “Revisar”. Nasce um número novo e o anterior fica marcado como substituído.",
      "Ela aprovou? “Converter em venda”. Aí sim o estoque baixa.",
      "Venda que veio de orçamento nasce travada, para bater com o PDF aprovado. Para mudar, revise o orçamento.",
    ],
    ir: { href: "/orcamentos/novo", rotulo: "Começar um orçamento" },
  },
  {
    id: "etiquetas",
    grupo: "dia",
    titulo: "Etiquetas e o QR",
    resumo: "Imprimir, montar o modelo e ler o código",
    passos: [
      "Uma só: abra a ficha do produto e toque em “Imprimir etiqueta”.",
      "Várias: em Estoque › Produtos, filtre o que quer (uma categoria, uma linha) e toque em “Etiquetas”.",
      "Escolha o modelo e quantas de cada. Sai em PDF, na impressora ou como imagem para a NIIMBOT.",
      "A palavra sob a logo segue a linha do produto: SEMIJOIAS, PERFUMARIA, ou só a logo em Outros.",
      "Para montar o seu modelo (logo, nome, preço, QR): Ajustes › Criação de etiquetas.",
      "O QR guarda o código do produto. Em Estoque, “Ler etiqueta” abre a câmera e a ficha do produto aparece sozinha.",
    ],
    ir: { href: "/estoque", rotulo: "Abrir Produtos" },
  },
  {
    id: "decant",
    grupo: "dia",
    titulo: "Perfume e decant",
    resumo: "Frasco inteiro, envase e o catálogo",
    passos: [
      "Cadastre o frasco inteiro como produto da linha Perfumaria: custo pelo valor pago e o volume em ml.",
      "Dê entrada nos frascos pela compra, como qualquer produto.",
      "Encheu decants? Abra a ficha do perfume e toque em “Envasar decants”.",
      "Escolha o tamanho (ou “+ Novo tamanho”, com os ml), diga quantos encheu e, se abriu um frasco agora, marque “Abri um frasco agora” — sai 1 do estoque do perfume.",
      "O custo do decant sai sozinho: custo do frasco ÷ ml × ml do decant, mais o frasquinho, se você informar.",
      "Os ml do frasco não são contados: o decant tem estoque em unidades, e é isso que a venda baixa.",
      "No catálogo das clientes, o frasco e os decants aparecem no mesmo card, para escolher o volume.",
    ],
    ir: { href: "/estoque?linha=PERFUMARIA", rotulo: "Abrir a Perfumaria" },
  },
  {
    id: "catalogo",
    grupo: "dia",
    titulo: "O catálogo das clientes",
    resumo: "O link que vai no WhatsApp",
    passos: [
      "O catálogo fica no endereço do app com /catalogo no fim. Abre sem login: é para mandar no WhatsApp e no Instagram.",
      "Aparece o que tem preço e já teve entrada. O que acabou aparece como “Esgotado”, com o “Avise-me”.",
      "A cliente vê preço, promoção e tamanhos — nunca custo, fornecedor ou quantas unidades há.",
      "Ela pode comprar um só (“Comprar agora”) ou juntar vários no carrinho e mandar um pedido. Os dois abrem o WhatsApp da loja com a mensagem pronta.",
      "O catálogo não grava venda: a loja confirma pelo WhatsApp e lança a venda aqui.",
    ],
    ir: { href: "/catalogo", rotulo: "Abrir o catálogo" },
  },
  {
    id: "caixa",
    grupo: "dia",
    titulo: "Conferir o caixa",
    resumo: "O que entrou, o que saiu e onde está",
    passos: [
      "Financeiro › Extrato mostra tudo que entrou e saiu, dia a dia.",
      "Compare o saldo de cada carteira com o dinheiro da gaveta e com o extrato do banco.",
      "Não bate? Veja primeiro os comprovantes pendentes: dinheiro sem comprovante ainda não conta no caixa.",
      "Passou dinheiro de uma carteira para outra (gaveta para o banco)? “Transferir entre carteiras”.",
      "Compra no cartão de crédito vai para a fatura; em Carteiras e cartões, “Pagar fatura” quando pagar.",
      "Vai entrar e Previsão mostram o que vem pela frente: parcelas a receber e contas a pagar.",
    ],
    ir: { href: "/financeiro?aba=fluxo", rotulo: "Abrir o Extrato" },
  },
  {
    id: "clientes",
    grupo: "dia",
    titulo: "Clientes",
    resumo: "Cadastro, quem deve e quem sumiu",
    passos: [
      "Cadastros › Clientes. Nome e telefone bastam para começar.",
      "Venda a prazo precisa de cliente: é de quem o app vai cobrar.",
      "“Parados” mostra quem não compra há um tempo (o prazo fica em Ajustes). Bom para mandar novidade.",
      "“Aniversariantes” mostra quem faz aniversário — se a data de nascimento estiver no cadastro.",
    ],
    ir: { href: "/cadastros", rotulo: "Abrir Clientes" },
  },
  {
    id: "devolucao",
    grupo: "problema",
    titulo: "Devolução e troca",
    resumo: "O produto que volta e o dinheiro que sai",
    passos: [
      "Abra a venda e toque em “Devolver”.",
      "Escolha os itens e quantos voltaram. O estoque sobe de novo, com o registro.",
      "Se o dinheiro volta para a cliente, diga de qual carteira ele sai: o acerto entra no caixa junto.",
      "Troca são duas coisas, nesta ordem: a devolução do que voltou e uma venda nova do que saiu no lugar.",
    ],
    ir: { href: "/vendas", rotulo: "Abrir Vendas" },
  },
  {
    id: "errei",
    grupo: "problema",
    titulo: "Errei uma venda: editar ou cancelar",
    resumo: "O que dá para consertar e como",
    passos: [
      "Abra a venda em Vendas.",
      "Errou produto, preço ou data? “Editar”. Os produtos voltam ao estoque e saem de novo, e o histórico mostra a edição.",
      "Os recebimentos não mudam na edição. Para desfazer um, use “Remover o recebimento”.",
      "Venda que veio de orçamento é travada: revise o orçamento em vez de editar.",
      "A venda não aconteceu? “Cancelar venda”, com o motivo. Os produtos voltam ao estoque e as parcelas em aberto somem — mas a venda fica na lista, marcada como cancelada.",
    ],
    ir: { href: "/vendas", rotulo: "Abrir Vendas" },
  },
  {
    id: "estoque-nao-bate",
    grupo: "problema",
    titulo: "O estoque não bate",
    resumo: "Contar e ajustar com motivo",
    passos: [
      "O estoque nunca muda sozinho: entra pela compra (ou envase de decant) e sai pela venda. Se está errado, faltou lançar alguma coisa.",
      "Conte o produto de verdade.",
      "Abra a ficha dele e toque em “Mexer no estoque”.",
      "“Ajuste de inventário”: baixa (sumiu, quebrou) ou acréscimo (achou), sempre com o motivo.",
      "Voltou para o fornecedor? “Devolução ao fornecedor” — se ele devolveu o dinheiro, dá para lançar o crédito no caixa.",
      "Tudo fica no histórico da ficha, com data e motivo.",
    ],
    ir: { href: "/estoque", rotulo: "Abrir Produtos" },
  },
  {
    id: "equipe",
    grupo: "problema",
    titulo: "Equipe e acesso",
    resumo: "Quem entra e o que cada um vê",
    passos: [
      "Cadastros › Usuários › Novo usuário.",
      "Escolha o papel e marque o que a pessoa pode ver e fazer em cada área.",
      "A vendedora não vê custo, margem nem o financeiro, a menos que você libere.",
      "No primeiro acesso a pessoa entra com o e-mail e escolhe a própria senha.",
      "Esqueceu a senha? “Redefinir senha” na linha do usuário.",
    ],
    ir: { href: "/usuarios", rotulo: "Abrir Usuários" },
  },
  {
    id: "instalar",
    grupo: "problema",
    titulo: "Instalar o app no celular",
    resumo: "Ícone na tela, em tela cheia",
    passos: [
      "iPhone: abra o app no Safari, toque em Compartilhar (o quadrado com a seta para cima) e escolha “Adicionar à Tela de Início”.",
      "Android: no Chrome, menu de três pontos › “Instalar aplicativo”.",
      "O ícone fica junto com os outros apps e abre em tela cheia, sem a barra do navegador.",
    ],
  },
] as const satisfies readonly Guia[];

export type IdGuia = (typeof GUIAS)[number]["id"];

export function guia(id: IdGuia): Guia {
  return GUIAS.find((g) => g.id === id)!;
}
