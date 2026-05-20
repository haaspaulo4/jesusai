const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

const app = createApp({
  setup() {
    const storeView = ref('catalog');
    const currentProduct = ref(null);
    const products = ref([]);
    const sections = ref([]);
    const categories = ref([]);
    const brand = ref({
      brandName: 'Loja',
      brandTagline: '',
      brandLogoUrl: '',
      brandPrimaryColor: '#D4A843',
      brandSecondaryColor: '#1a1a2e',
      whatsappUrl: '',
      instagramUrl: '',
      facebookUrl: '',
      tiktokUrl: '',
      currency: 'BRL',
      currencySymbol: 'R$',
    });
    const activeCategory = ref('');
    const currentLang = ref(localStorage.getItem('store_lang') || 'pt-BR');
    const cart = ref(JSON.parse(localStorage.getItem('store_cart') || '[]'));
    const cartOpen = ref(false);
    const checkoutOpen = ref(false);
    const mobileMenuOpen = ref(false);
    const showCookieBanner = ref(false);
    const orderForm = ref({ name: '', phone: '', email: '', address: '', coupon: '', notes: '' });

    const translations = {
      'pt-BR': {
        featured: 'Em destaque', featuredTag: 'EM DESTAQUE', featuredTitle: 'Os mais desejados',
        catalog: 'Catálogo', catalogTag: 'CATÁLOGO COMPLETO', catalogTitle: 'Nossos Produtos',
        about: 'Sobre', aboutUs: 'Sobre nós', all: 'Todos', viewCatalog: 'Ver Catálogo',
        addToCart: 'Adicionar', consultPrice: 'Consulte', ask: 'Perguntar', askPrice: 'Perguntar preço',
        outOfStock: 'Esgotado', inStock: 'Em estoque', yourCart: 'Seu Carrinho', cartEmpty: 'Seu carrinho está vazio',
        total: 'Total', checkoutWhatsapp: 'Finalizar no WhatsApp', checkoutTitle: 'Finalizar Pedido',
        fullName: 'Nome completo', yourName: 'Seu nome', phonePlaceholder: '(11) 99999-9999',
        address: 'Endereço de entrega', addressPlaceholder: 'Rua, Nº - Bairro, Cidade/UF',
        coupon: 'Código de cupom', couponPlaceholder: 'CUPOM10', notes: 'Observações', notesPlaceholder: 'Alguma observação?',
        sendOrder: 'Enviar Pedido via WhatsApp', startNow: 'Começar Agora',
        home: 'Início', allRights: 'Todos os direitos reservados', privacy: 'Privacidade',
        cookies: 'Cookies', terms: 'Termos', cookieText: 'Utilizamos cookies para melhorar sua experiência.',
        accept: 'Aceitar', reject: 'Recusar', interestIn: 'Tenho interesse no', and: 'e',
        featuresTag: 'RECURSOS', specifications: 'Especificações',
      },
      'en-US': {
        featured: 'Featured', featuredTag: 'FEATURED', featuredTitle: 'Most Wanted',
        catalog: 'Catalog', catalogTag: 'FULL CATALOG', catalogTitle: 'Our Products',
        about: 'About', aboutUs: 'About us', all: 'All', viewCatalog: 'View Catalog',
        addToCart: 'Add to Cart', consultPrice: 'Contact us', ask: 'Ask', askPrice: 'Ask for price',
        outOfStock: 'Out of Stock', inStock: 'In stock', yourCart: 'Your Cart', cartEmpty: 'Your cart is empty',
        total: 'Total', checkoutWhatsapp: 'Checkout via WhatsApp', checkoutTitle: 'Complete Order',
        fullName: 'Full name', yourName: 'Your name', phonePlaceholder: '+1 (555) 000-0000',
        address: 'Shipping address', addressPlaceholder: 'Street, City, State',
        coupon: 'Coupon code', couponPlaceholder: 'COUPON10', notes: 'Notes', notesPlaceholder: 'Any notes?',
        sendOrder: 'Send Order via WhatsApp', startNow: 'Start Now',
        home: 'Home', allRights: 'All rights reserved', privacy: 'Privacy',
        cookies: 'Cookies', terms: 'Terms', cookieText: 'We use cookies to improve your experience.',
        accept: 'Accept', reject: 'Reject', interestIn: 'I\'m interested in', and: 'and',
        featuresTag: 'FEATURES', specifications: 'Specifications',
      },
      'es-ES': {
        featured: 'Destacados', featuredTag: 'DESTACADOS', featuredTitle: 'Los más deseados',
        catalog: 'Catálogo', catalogTag: 'CATÁLOGO COMPLETO', catalogTitle: 'Nuestros Productos',
        about: 'Sobre', aboutUs: 'Sobre nosotros', all: 'Todos', viewCatalog: 'Ver Catálogo',
        addToCart: 'Añadir', consultPrice: 'Consultar', ask: 'Preguntar', askPrice: 'Preguntar precio',
        outOfStock: 'Agotado', inStock: 'En stock', yourCart: 'Tu Carrito', cartEmpty: 'Tu carrito está vacío',
        total: 'Total', checkoutWhatsapp: 'Finalizar por WhatsApp', checkoutTitle: 'Completar Pedido',
        fullName: 'Nombre completo', yourName: 'Tu nombre', phonePlaceholder: '+34 600 000 000',
        address: 'Dirección de envío', addressPlaceholder: 'Calle, Ciudad',
        coupon: 'Código de cupón', couponPlaceholder: 'CUPON10', notes: 'Notas', notesPlaceholder: '¿Alguna nota?',
        sendOrder: 'Enviar Pedido por WhatsApp', startNow: 'Empezar Ahora',
        home: 'Inicio', allRights: 'Todos los derechos reservados', privacy: 'Privacidad',
        cookies: 'Cookies', terms: 'Términos', cookieText: 'Usamos cookies para mejorar su experiencia.',
        accept: 'Aceptar', reject: 'Rechazar', interestIn: 'Me interesa', and: 'y',
        featuresTag: 'CARACTERÍSTICAS', specifications: 'Especificaciones',
      },
    };

    function t(key) {
      return (translations[currentLang.value] || translations['pt-BR'])[key] || key;
    }

    function formatCurrency(value) {
      const sym = brand.value.currencySymbol || 'R$';
      return sym + ' ' + (value || 0).toFixed(2).replace('.', ',');
    }

    function getLocalizedField(product, field) {
      if (!product) return '';
      const langMap = { 'pt-BR': field, 'en-US': field + '_en' || field, 'es-ES': field + '_es' || field };
      const langField = langMap[currentLang.value] || field;
      if (product[langField]) return product[langField];
      if (product[field]) return product[field];
      return '';
    }

    const heroSection = computed(() => sections.value.find(s => s.type === 'hero'));
    const featuresSection = computed(() => sections.value.find(s => s.type === 'features'));
    const aboutSection = computed(() => sections.value.find(s => s.type === 'cta' || s.type === 'about'));
    const ctaSection = computed(() => sections.value.find(s => s.type === 'cta' && s !== aboutSection.value) || sections.value.find(s => s.type === 'cta'));
    const hasFeatured = computed(() => products.value.some(p => p.isFeatured));
    const featuredProducts = computed(() => products.value.filter(p => p.isFeatured));

    const filteredProducts = computed(() => {
      if (!activeCategory.value) return products.value;
      return products.value.filter(p => p.category === activeCategory.value);
    });

    const cartCount = computed(() => cart.value.reduce((s, i) => s + i.qty, 0));
    const cartTotal = computed(() => cart.value.reduce((s, i) => s + i.price * i.qty, 0));

    function toggleCart() { cartOpen.value = !cartOpen.value; checkoutOpen.value = false; }

    function addToCart(product) {
      const existing = cart.value.find(i => i.id === product.id);
      if (existing) { existing.qty += 1; }
      else { cart.value.push({ id: product.id, name: product.name, price: product.price, image: product.featuredImage || (product.images && product.images[0]) || '', qty: 1 }); }
      saveCart();
      cartOpen.value = true;
    }

    function removeFromCart(idx) { cart.value.splice(idx, 1); saveCart(); }

    function updateCartQty(idx, qty) {
      if (qty < 1) { cart.value.splice(idx, 1); }
      else { cart.value[idx].qty = qty; }
      saveCart();
    }

    function saveCart() { localStorage.setItem('store_cart', JSON.stringify(cart.value)); }

    function viewProduct(productId) {
      const p = products.value.find(p => p.id === productId);
      if (p) {
        currentProduct.value = p;
        storeView.value = 'product';
        window.scrollTo(0, 0);
      } else {
        fetchProduct(productId);
      }
    }

    async function fetchProduct(productId) {
      try {
        const res = await fetch(`/api/store/products/${productId}`);
        if (res.ok) {
          currentProduct.value = await res.json();
          storeView.value = 'product';
          window.scrollTo(0, 0);
        }
      } catch (e) { console.error('Error fetching product:', e); }
    }

    function showCheckout() {
      if (cart.value.length === 0) return;
      cartOpen.value = false;
      checkoutOpen.value = true;
    }

    async function submitOrder() {
      const name = orderForm.value.name.trim();
      const phone = orderForm.value.phone.trim();
      if (!name || !phone) {
        const errEl = document.getElementById('checkoutError');
        errEl.textContent = t('fullName') + ' e WhatsApp são obrigatórios.';
        errEl.style.display = 'block';
        return;
      }

      const items = cart.value.map(i => ({ product_id: i.id, title: i.name, unit_price: i.price, quantity: i.qty }));
      const total = cartTotal.value;

      try {
        const res = await fetch('/api/store/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: name,
            customer_phone: phone,
            customer_email: orderForm.value.email || undefined,
            items,
            coupon_code: orderForm.value.coupon || undefined,
            notes: orderForm.value.notes || undefined,
            source: 'storefront',
          }),
        });
        const data = await res.json();
        if (data.whatsappUrl) {
          window.open(data.whatsappUrl, '_blank');
        } else if (brand.value.whatsappUrl) {
          let msg = `Olá! Gostaria de fazer um pedido:\n\n*Itens:*\n`;
          cart.value.forEach(i => { msg += `• ${i.name} x${i.qty} — ${formatCurrency(i.price * i.qty)}\n`; });
          msg += `\n*Total: ${formatCurrency(total)}*`;
          msg += `\n\nPoderia confirmar disponibilidade?`;
          window.open(brand.value.whatsappUrl + '&text=' + encodeURIComponent(msg), '_blank');
        }
        checkoutOpen.value = false;
        cart.value = [];
        saveCart();
        orderForm.value = { name: '', phone: '', email: '', address: '', coupon: '', notes: '' };
      } catch (e) {
        if (brand.value.whatsappUrl) {
          let msg = `Olá! Gostaria de fazer um pedido:\n\n*Itens:*\n`;
          cart.value.forEach(i => { msg += `• ${i.name} x${i.qty} — ${formatCurrency(i.price * i.qty)}\n`; });
          msg += `\n*Total: ${formatCurrency(total)}*`;
          window.open(brand.value.whatsappUrl + '&text=' + encodeURIComponent(msg), '_blank');
        }
        checkoutOpen.value = false;
        cart.value = [];
        saveCart();
      }
    }

    function acceptCookies(type) {
      localStorage.setItem('store_cookie_consent', type);
      showCookieBanner.value = false;
    }

    function saveLang() { localStorage.setItem('store_lang', currentLang.value); loadSections(); }

    function applyBrandColors() {
      const primary = brand.value.brandPrimaryColor || '#D4A843';
      const secondary = brand.value.brandSecondaryColor || '#1a1a2e';
      const r = parseInt(primary.substring(1,3), 16);
      const g = parseInt(primary.substring(3,5), 16);
      const b = parseInt(primary.substring(5,7), 16);
      const primaryLight = `#${Math.min(255,r+60).toString(16).padStart(2,'0')}${Math.min(255,g+60).toString(16).padStart(2,'0')}${Math.min(255,b+60).toString(16).padStart(2,'0')}`;
      const primaryDark = `#${Math.max(0,r-40).toString(16).padStart(2,'0')}${Math.max(0,g-40).toString(16).padStart(2,'0')}${Math.max(0,b-40).toString(16).padStart(2,'0')}`;
      const styleEl = document.getElementById('storeThemeVars');
      if (styleEl) {
        styleEl.textContent = `:root {
          --st-accent: ${primary};
          --st-accent-light: ${primaryLight};
          --st-accent-dark: ${primaryDark};
          --st-accent-gradient: linear-gradient(135deg, ${primary} 0%, ${primaryLight} 50%, ${primary} 100%);
          --st-dark: ${secondary};
          --st-shadow-glow: 0 0 40px rgba(${r},${g},${b},0.08);
        }`;
      }
      document.title = brand.value.brandName || 'Loja';
      const fontEl = document.getElementById('storeFonts');
      const fontDisplay = 'Playfair Display';
      const fontBody = 'Inter';
      if (fontEl) {
        fontEl.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontDisplay)}:wght@300;400;500;600;700&family=${encodeURIComponent(fontBody)}:wght@300;400;500;600;700&display=swap`;
      }
    }

    async function loadBrand() {
      try {
        const res = await fetch('/api/store/brand');
        if (res.ok) {
          const data = await res.json();
          Object.assign(brand.value, data);
          applyBrandColors();
        }
      } catch (e) { console.error('Error loading brand:', e); }
    }

    async function loadProducts() {
      try {
        const res = await fetch('/api/store/products');
        if (res.ok) {
          const data = await res.json();
          products.value = data.products || [];
          const cats = [...new Set(products.value.map(p => p.category).filter(Boolean))];
          categories.value = cats;
        }
      } catch (e) { console.error('Error loading products:', e); }
    }

    async function loadSections() {
      try {
        const res = fetch(`/api/store/sections?lang=${currentLang.value}`);
        const data = await (await res).json();
        sections.value = data.sections || [];
      } catch (e) { console.error('Error loading sections:', e); }
    }

    function initReveal() {
      nextTick(() => {
        const elements = document.querySelectorAll('.st-reveal');
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed');
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
        elements.forEach(el => observer.observe(el));
      });
    }

    function handleScroll() {
      const header = document.getElementById('storeHeader');
      if (header) {
        if (window.scrollY > 50) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
      }
    }

    onMounted(async () => {
      showCookieBanner.value = !localStorage.getItem('store_cookie_consent');
      await loadBrand();
      await Promise.all([loadProducts(), loadSections()]);
      initReveal();
      window.addEventListener('scroll', handleScroll);
    });

    watch(storeView, () => { nextTick(initReveal); });
    watch(products, () => { nextTick(initReveal); }, { deep: true });

    return {
      storeView, currentProduct, products, sections, categories, brand, activeCategory, currentLang,
      cart, cartOpen, checkoutOpen, mobileMenuOpen, showCookieBanner, orderForm,
      heroSection, featuresSection, aboutSection, ctaSection, hasFeatured, featuredProducts,
      filteredProducts, cartCount, cartTotal,
      t, formatCurrency, getLocalizedField, toggleCart, addToCart, removeFromCart, updateCartQty,
      viewProduct, showCheckout, submitOrder, acceptCookies, saveLang,
    };
  },
});

app.mount('#storeApp');