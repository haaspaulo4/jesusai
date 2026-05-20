const erp = require('../erp');

const ERP_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'catalog_search',
      description: 'Busca produtos no catálogo. Use para responder perguntas sobre preços, estoque, disponibilidade e informações técnicas de produtos. Pode buscar por nome, categoria ou termo livre.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Termo de busca (nome do produto, marca, categoria)' },
          category: { type: 'string', description: 'Categoria para filtrar (perfumes-masculinos, perfumes-femininos, etc.)' },
          type: { type: 'string', enum: ['physical', 'digital', 'service'], description: 'Tipo de produto' },
          in_stock_only: { type: 'boolean', description: 'Se true, retorna apenas produtos com estoque disponível' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'catalog_detail',
      description: 'Retorna detalhes completos de um produto: ficha técnica, preço, variações, estoque, imagens.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'ID do produto' },
        },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'catalog_categories',
      description: 'Lista todas as categorias de produtos disponíveis.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_order',
      description: 'Cria um pedido para o cliente. Use quando o cliente quiser comprar produtos ou solicitar serviços. Calcula automaticamente o total.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Nome do cliente' },
          customer_phone: { type: 'string', description: 'Telefone do cliente (WhatsApp)' },
          customer_email: { type: 'string', description: 'Email do cliente' },
          items: {
            type: 'array',
            description: 'Lista de itens do pedido',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string', description: 'ID do produto' },
                variant_id: { type: 'string', description: 'ID da variação (se aplicável)' },
                title: { type: 'string', description: 'Nome do item' },
                quantity: { type: 'integer', description: 'Quantidade' },
                unit_price: { type: 'number', description: 'Preço unitário' },
                type: { type: 'string', enum: ['physical', 'digital', 'service', 'shipping', 'discount'], description: 'Tipo do item' },
              },
              required: ['title', 'quantity', 'unit_price'],
            },
          },
          shipping_address: { type: 'object', description: 'Endereço de entrega: {street, number, complement, neighborhood, city, state, zip}' },
          notes: { type: 'string', description: 'Observações do pedido' },
          source: { type: 'string', enum: ['whatsapp', 'telegram', 'web', 'api', 'manual'], description: 'Canal de origem' },
        },
        required: ['customer_name', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'order_status',
      description: 'Consulta o status de um pedido pelo número ou ID. Retorna status, itens, valor, pagamento e entrega.',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Número do pedido (ex: ORD-250519-0001) ou ID' },
        },
        required: ['order_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_order_status',
      description: 'Atualiza o status de um pedido (confirmar pagamento, marcar como enviado, etc.). Use para gerenciar o fluxo de pedidos.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'ID do pedido' },
          status: { type: 'string', enum: ['confirmed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'], description: 'Novo status' },
          tracking_code: { type: 'string', description: 'Código de rastreio (para status shipped)' },
          notes: { type: 'string', description: 'Notas internas' },
        },
        required: ['order_id', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stock_check',
      description: 'Verifica o estoque de um produto específico ou lista produtos com estoque baixo.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'ID do produto para verificar estoque específico' },
          low_stock_only: { type: 'boolean', description: 'Se true, retorna apenas produtos com estoque baixo' },
          threshold: { type: 'integer', description: 'Limite para considerar estoque baixo (padrão: 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'financial_summary',
      description: 'Retorna resumo financeiro: receita, despesas, lucro, pedidos por status, ticket médio.',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'Data inicial (YYYY-MM-DD)' },
          date_to: { type: 'string', description: 'Data final (YYYY-MM-DD)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_payment_link',
      description: 'Gera um link de pagamento PIX para um pedido existente.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'ID do pedido' },
          amount: { type: 'number', description: 'Valor (se diferente do total do pedido)' },
          description: { type: 'string', description: 'Descrição do pagamento' },
          expires_hours: { type: 'integer', description: 'Horas até expirar (padrão: 24)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'supplier_list',
      description: 'Lista fornecedores. Use para encontrar fornecedores por nome, categoria ou buscar detalhes de contato.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Buscar por nome, documento ou contato' },
          category: { type: 'string', description: 'Categoria do fornecedor' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'supplier_create',
      description: 'Cadastra um novo fornecedor. Use quando o cliente informa dados de um fornecedor que não está no sistema.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome/Razão social do fornecedor' },
          trade_name: { type: 'string', description: 'Nome fantasia' },
          document: { type: 'string', description: 'CNPJ/CPF do fornecedor' },
          email: { type: 'string', description: 'Email' },
          phone: { type: 'string', description: 'Telefone' },
          whatsapp: { type: 'string', description: 'WhatsApp' },
          contact_name: { type: 'string', description: 'Nome do contato principal' },
          category: { type: 'string', description: 'Categoria (ex: perfumaria, embalagens, logística)' },
          city: { type: 'string', description: 'Cidade' },
          state: { type: 'string', description: 'Estado' },
          payment_terms: { type: 'string', description: 'Condições de pagamento (ex: 30/60/90 dias)' },
          delivery_time_days: { type: 'integer', description: 'Prazo médio de entrega em dias' },
          notes: { type: 'string', description: 'Observações' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stock_entry',
      description: 'Registra entrada de estoque (compra de fornecedor, devolução, ajuste). Atualiza automaticamente a quantidade disponível.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'ID do produto' },
          variant_id: { type: 'string', description: 'ID da variação (se aplicável)' },
          quantity: { type: 'integer', description: 'Quantidade (positivo para entrada, negativo para ajuste)' },
          type: { type: 'string', enum: ['in', 'out', 'adjustment', 'return', 'reserved', 'released', 'loss'], description: 'Tipo de movimentação' },
          reason: { type: 'string', description: 'Motivo (ex: compra fornecedor X, ajuste inventário)' },
          cost_per_unit: { type: 'number', description: 'Custo unitário da compra' },
        },
        required: ['product_id', 'quantity', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inventory_report',
      description: 'Relatório de inventário completo. Mostra produtos com estoque, valor em estoque, produtos sem estoque e alertas.',
      parameters: {
        type: 'object',
        properties: {
          include_zero_stock: { type: 'boolean', description: 'Incluir produtos sem estoque (padrão: true)' },
          category: { type: 'string', description: 'Filtrar por categoria' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_add_to_cart',
      description: 'Adiciona um produto ao carrinho do cliente. Use quando o cliente quer comprar ou pedir um produto. Retorna o carrinho atualizado com resumo.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão do WhatsApp/Telegram' },
          product_id: { type: 'string', description: 'ID do produto' },
          variant_id: { type: 'string', description: 'ID da variação (se houver)' },
          quantity: { type: 'integer', description: 'Quantidade (padrão: 1)' },
          customer_name: { type: 'string', description: 'Nome do cliente (se informado)' },
          customer_phone: { type: 'string', description: 'Telefone do cliente' },
        },
        required: ['session_id', 'product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_remove_from_cart',
      description: 'Remove um produto do carrinho do cliente.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão' },
          product_id: { type: 'string', description: 'ID do produto a remover' },
          variant_id: { type: 'string', description: 'ID da variação (se houver)' },
        },
        required: ['session_id', 'product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_cart_summary',
      description: 'Retorna o resumo do carrinho atual do cliente: itens, quantidades, subtotal, frete, total.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão' },
        },
        required: ['session_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_clear_cart',
      description: 'Limpa o carrinho do cliente. Use quando o cliente quer cancelar ou recomeçar o pedido.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão' },
        },
        required: ['session_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_set_address',
      description: 'Registra o endereço de entrega do cliente e calcula a taxa de frete automaticamente com base nas zonas de entrega configuradas.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão' },
          street: { type: 'string', description: 'Rua' },
          number: { type: 'string', description: 'Número' },
          complement: { type: 'string', description: 'Complemento (apto, bloco, etc.)' },
          neighborhood: { type: 'string', description: 'Bairro' },
          city: { type: 'string', description: 'Cidade' },
          state: { type: 'string', description: 'Estado' },
          zip: { type: 'string', description: 'CEP' },
          full_address: { type: 'string', description: 'Endereço completo em formato livre (se não tiver campos separados)' },
        },
        required: ['session_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_set_payment',
      description: 'Registra a forma de pagamento e opcionalmente o valor para troco.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão' },
          payment_method: { type: 'string', enum: ['pix', 'dinheiro', 'cartao', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto'], description: 'Forma de pagamento' },
          change_for: { type: 'number', description: 'Valor pago em dinheiro (para calcular troco). Use apenas para pagamento em dinheiro.' },
        },
        required: ['session_id', 'payment_method'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_apply_coupon',
      description: 'Aplica um cupom de desconto ao carrinho do cliente. Valida cupom e calcula desconto.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão' },
          code: { type: 'string', description: 'Código do cupom' },
        },
        required: ['session_id', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_finalize_order',
      description: 'Finaliza o pedido criando-o no sistema. Deduz estoque automaticamente. Use quando o cliente confirmar o pedido completo (itens, endereço, pagamento).',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'ID da sessão' },
          source: { type: 'string', enum: ['whatsapp', 'telegram', 'web', 'api', 'manual'], description: 'Canal de origem (padrão: whatsapp)' },
        },
        required: ['session_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_get_order',
      description: 'Consulta um pedido pelo número ou ID. Retorna status, itens, valores e informações de entrega.',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Número do pedido (ex: ORD-250519-0001) ou ID' },
        },
        required: ['order_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'commerce_calculate_delivery',
      description: 'Calcula a taxa de entrega baseado no endereço. Retorna valor do frete e prazo estimado.',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Endereço completo ou parcial para cálculo do frete' },
        },
        required: ['address'],
      },
    },
  },
];

async function executeERPTool(name, args) {
  switch (name) {
    case 'catalog_search': {
      const products = await erp.products.listProducts({
        search: args.search,
        category: args.category,
        type: args.type,
        is_active: true,
      });
      const filtered = args.in_stock_only ? products.filter(p => !p.track_stock || p.stock > 0) : products;
      if (filtered.length === 0) return { found: false, message: 'Nenhum produto encontrado para essa busca.' };
      return {
        found: true,
        count: filtered.length,
        products: filtered.slice(0, 10).map(p => ({
          id: p.id, name: p.name, price: p.price, compare_at_price: p.compare_at_price,
          stock: p.track_stock ? p.stock : null, category: p.category, type: p.type,
          brand: p.brand, is_featured: p.is_featured,
          image: p.featured_image || (p.images && p.images[0]) || null,
          variants: (p.variants || []).map(v => ({ id: v.id, name: v.name, price: v.price, stock: v.stock })),
        })),
      };
    }

    case 'catalog_detail': {
      const p = await erp.products.getProduct(args.product_id);
      if (!p) return { error: 'Produto não encontrado' };
      return {
        id: p.id, name: p.name, name_en: p.name_en, name_es: p.name_es,
        description: p.description, price: p.price, compare_at_price: p.compare_at_price,
        cost_price: p.cost_price, stock: p.stock, low_stock_threshold: p.low_stock_threshold,
        track_stock: p.track_stock, category: p.category, brand: p.brand, type: p.type,
        weight: p.weight, dimensions: p.dimensions, technical_specs: p.technical_specs,
        images: p.images, featured_image: p.featured_image, tags: p.tags, is_featured: p.is_featured,
        variants: (p.variants || []).map(v => ({ id: v.id, name: v.name, price: v.price, stock: v.stock, sku: v.sku })),
        is_digital: p.is_digital, digital_file: p.digital_file,
      };
    }

    case 'catalog_categories': {
      const categories = await erp.products.getCategoryTree();
      return { categories };
    }

    case 'create_order': {
      const customer_id = args.customer_id || null;
      try {
        const order = await erp.orders.createOrder({
          customer_id,
          customer_name: args.customer_name,
          customer_phone: args.customer_phone,
          customer_email: args.customer_email || null,
          items: args.items.map(i => ({ ...i, product_id: i.product_id || null, type: i.type || 'physical' })),
          shipping_address: args.shipping_address || null,
          notes: args.notes || null,
          source: args.source || 'whatsapp',
          deduct_stock: true,
        });
        return {
          success: true,
          order_id: order.id,
          order_number: order.order_number,
          total: order.total,
          status: order.status,
          items: order.items.map(i => `${i.title} x${i.quantity} = R$ ${i.total.toFixed(2)}`).join('\n'),
          message: `Pedido *#${order.order_number}* criado!\n\n${order.items.map(i => `• ${i.title} x${i.quantity} — R$ ${i.total.toFixed(2)}`).join('\n')}\n\n💰 Total: R$ ${order.total.toFixed(2)}\nStatus: ${order.status}`,
        };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'order_status': {
      let order;
      if (args.order_number.startsWith('ORD-')) {
        order = await erp.orders.getOrderByNumber(args.order_number);
      } else {
        order = await erp.orders.getOrder(args.order_number);
      }
      if (!order) return { error: 'Pedido não encontrado' };
      return {
        id: order.id, order_number: order.order_number, status: order.status,
        payment_status: order.payment_status, fulfillment_status: order.fulfillment_status,
        total: order.total, customer_name: order.customer_name,
        items: order.items.map(i => ({ title: i.title, quantity: i.quantity, total: i.total })),
        created_at: order.created_at,
        deliveries: (order.deliveries || []).map(d => ({ tracking_code: d.tracking_code, carrier: d.carrier, status: d.status })),
        message: erp.orders.formatOrderForWhatsApp(order),
      };
    }

    case 'update_order_status': {
      try {
        const updated = await erp.orders.updateOrderStatus(args.order_id, args.status, {
          internal_notes: args.notes,
          tracking_code: args.tracking_code,
        });
        return { success: true, order_id: updated.id, order_number: updated.order_number, new_status: updated.status };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'stock_check': {
      if (args.product_id) {
        const p = await erp.products.getProduct(args.product_id);
        if (!p) return { error: 'Produto não encontrado' };
        return {
          product_id: p.id, name: p.name, stock: p.stock, track_stock: p.track_stock,
          low_stock_threshold: p.low_stock_threshold, is_low_stock: p.track_stock && p.stock <= p.low_stock_threshold,
          variants: (p.variants || []).map(v => ({ id: v.id, name: v.name, stock: v.stock })),
        };
      }
      const threshold = parseInt(args.threshold) || 5;
      const products = await erp.products.getLowStockProducts(threshold);
      return { threshold, low_stock_count: products.length, products: products.map(p => ({ id: p.id, name: p.name, stock: p.stock, threshold: p.low_stock_threshold })) };
    }

    case 'financial_summary': {
      const summary = await erp.finance.getFinancialSummary({ date_from: args.date_from, date_to: args.date_to });
      return summary;
    }

    case 'generate_payment_link': {
      try {
        const order = await erp.orders.getOrder(args.order_id);
        if (!order) return { error: 'Pedido não encontrado' };
        const amount = args.amount || order.total;
        const expiresAt = new Date(Date.now() + (args.expires_hours || 24) * 60 * 60 * 1000).toISOString();
        const link = await erp.finance.createPaymentLink({
          order_id: args.order_id,
          amount,
          description: args.description || `Pedido #${order.order_number}`,
          expires_at: expiresAt,
          customer_id: order.customer_id,
          customer_email: order.customer_email,
          customer_phone: order.customer_phone,
        });
        return {
          success: true,
          payment_id: link.id,
          amount,
          pix_code: link.pix_code || null,
          payment_url: link.payment_url || null,
          expires_at: link.expires_at,
          message: `💳 Link de pagamento criado para o pedido *#${order.order_number}*\n\n💰 Valor: R$ ${amount.toFixed(2)}\n⏰ Expira em: ${args.expires_hours || 24}h\n${link.pix_code ? `\nPIX copia e cola:\n\`${link.pix_code}\`` : ''}\n${link.payment_url ? `\nLink: ${link.payment_url}` : ''}`,
        };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'supplier_list': {
      const suppliers = await erp.suppliers.listSuppliers({ search: args.search, category: args.category, is_active: true });
      if (suppliers.length === 0) return { found: false, message: 'Nenhum fornecedor encontrado.' };
      return {
        found: true,
        count: suppliers.length,
        suppliers: suppliers.slice(0, 10).map(s => ({
          id: s.id, name: s.name, trade_name: s.trade_name, document: s.document,
          phone: s.phone, whatsapp: s.whatsapp, email: s.email, city: s.city, state: s.state,
          category: s.category, contact_name: s.contact_name, rating: s.rating,
          payment_terms: s.payment_terms, delivery_time_days: s.delivery_time_days,
        })),
      };
    }

    case 'supplier_create': {
      try {
        const supplier = await erp.suppliers.createSupplier({ ...args });
        return { success: true, id: supplier.id, name: supplier.name, message: `Fornecedor *${supplier.name}* cadastrado com sucesso!` };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'stock_entry': {
      try {
        const result = await erp.products.adjustStock(
          args.product_id, args.variant_id || null, args.type, args.quantity, args.reason, null, null
        );
        const product = await erp.products.getProduct(args.product_id);
        return {
          success: true,
          product: product ? product.name : args.product_id,
          previous_stock: result.previousStock,
          new_stock: result.newStock,
          movement_type: args.type,
          quantity: args.quantity,
          message: `✅ Estoque atualizado: ${product ? product.name : args.product_id}\n${args.type === 'in' ? '📥 Entrada' : args.type === 'out' ? '📤 Saída' : args.type === 'return' ? '↩️ Devolução' : '🔄 Ajuste'}: ${args.quantity} unidades\nEstoque anterior: ${result.previousStock}\nEstoque atual: ${result.newStock}`,
        };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'inventory_report': {
      const stats = await erp.products.getProductStats();
      const lowStock = await erp.products.getLowStockProducts(5);
      const products = await erp.products.listProducts({ is_active: true, limit: 200 });
      const byCategory = {};
      for (const p of products) {
        const cat = p.category || 'sem categoria';
        if (!byCategory[cat]) byCategory[cat] = { products: 0, stock: 0, value: 0 };
        byCategory[cat].products++;
        byCategory[cat].stock += p.stock || 0;
        byCategory[cat].value += (p.price || 0) * (p.stock || 0);
      }
      const includeZero = args.include_zero_stock !== false;
      const filteredProducts = includeZero ? products : products.filter(p => !p.track_stock || p.stock > 0);
      const category = args.category;
      const displayProducts = category
        ? filteredProducts.filter(p => p.category === category)
        : filteredProducts.slice(0, 20);

      return {
        summary: {
          total_products: stats.total,
          total_stock: stats.by_type.reduce((sum, t) => sum + t.total_stock, 0),
          inventory_value: stats.by_type.reduce((sum, t) => sum + t.inventory_value, 0),
          low_stock_count: stats.low_stock,
          out_of_stock_count: stats.out_of_stock,
          by_type: stats.by_type,
        },
        by_category: byCategory,
        low_stock_alerts: lowStock.slice(0, 10).map(p => ({ id: p.id, name: p.name, stock: p.stock, threshold: p.low_stock_threshold })),
        products: displayProducts.map(p => ({
          id: p.id, name: p.name, category: p.category, price: p.price, cost_price: p.cost_price,
          stock: p.track_stock ? p.stock : '∞', type: p.type, is_featured: p.is_featured,
        })),
      };
    }

    case 'commerce_add_to_cart': {
      const commerce = require('../erp/commerce');
      const product = await erp.products.getProduct(args.product_id);
      if (!product) return { error: 'Produto não encontrado' };
      if (product.track_stock && product.stock < (args.quantity || 1)) {
        return { error: `${product.name} está fora de estoque.`, available: 0 };
      }
      const price = product.price;
      let cart = await commerce.getOrCreateCart(args.session_id, args.customer_phone, null);
      if (args.customer_name && !cart.metadata?.customer_name) {
        cart.metadata = cart.metadata || {};
        cart.metadata.customer_name = args.customer_name;
        await commerce.updateCart(args.session_id, { metadata: cart.metadata });
      }
      if (args.customer_phone && !cart.metadata?.customer_phone) {
        cart.metadata = cart.metadata || {};
        cart.metadata.customer_phone = args.customer_phone;
        await commerce.updateCart(args.session_id, { metadata: cart.metadata });
      }
      const addItem = {
        product_id: args.product_id,
        variant_id: args.variant_id || null,
        title: product.name,
        unit_price: price,
        quantity: args.quantity || 1,
        image: product.featured_image || (product.images && product.images[0]) || null,
        type: product.type || 'physical',
      };
      cart = await commerce.addCartItem(args.session_id, addItem);
      if (!cart) return { error: 'Erro ao adicionar ao carrinho.' };
      return {
        success: true,
        added: addItem.title,
        quantity: args.quantity || 1,
        unit_price: price,
        item_total: price * (args.quantity || 1),
        cart: commerce.getCartSummary(cart),
        message: `✅ Adicionei *${addItem.title}* x${addItem.quantity} ao pedido!\n\n${commerce.formatCartForWhatsApp(cart)}`,
      };
    }

    case 'commerce_remove_from_cart': {
      const commerce = require('../erp/commerce');
      const cart = await commerce.removeCartItem(args.session_id, args.product_id, args.variant_id);
      if (!cart) return { error: 'Carrinho não encontrado.' };
      return {
        success: true,
        cart: commerce.getCartSummary(cart),
        message: cart.items.length > 0 ? `Item removido!\n\n${commerce.formatCartForWhatsApp(cart)}` : 'Carrinho esvaziado.',
      };
    }

    case 'commerce_cart_summary': {
      const commerce = require('../erp/commerce');
      const cart = await commerce.getCart(args.session_id);
      if (!cart || cart.items.length === 0) {
        return { empty: true, message: '🛒 Seu carrinho está vazio. Quer ver nosso catálogo?' };
      }
      return {
        empty: false,
        cart: commerce.getCartSummary(cart),
        flow_step: cart.flow_step,
        shipping_address: cart.shipping_address,
        payment_method: cart.metadata?.payment_method,
        change_for: cart.metadata?.change_for,
        message: commerce.formatCartForWhatsApp(cart),
      };
    }

    case 'commerce_clear_cart': {
      const commerce = require('../erp/commerce');
      const cart = await commerce.clearCart(args.session_id);
      return { success: true, message: '🗑️ Carrinho limpo! Posso ajudar com algo mais?' };
    }

    case 'commerce_set_address': {
      const commerce = require('../erp/commerce');
      let cart = await commerce.getOrCreateCart(args.session_id);
      const address = {
        street: args.street || '',
        number: args.number || '',
        complement: args.complement || '',
        neighborhood: args.neighborhood || '',
        city: args.city || '',
        state: args.state || '',
        zip: args.zip || '',
        full: args.full_address || [args.street, args.number, args.complement, args.neighborhood, args.city, args.state].filter(Boolean).join(', '),
      };
      const delivery = await commerce.calculateDeliveryFee(address.full || address.street || '');
      let metadata = cart.metadata || {};
      metadata.shipping_fee = delivery.fee;
      metadata.estimated_delivery = delivery.estimatedMinutes;
      if (delivery.matchedZone) {
        metadata.delivery_zone = delivery.matchedZone.name;
      }
      const freeAbove = delivery.freeAbove;
      const summary = commerce.getCartSummary(cart);
      if (freeAbove > 0 && summary.subtotal >= freeAbove) {
        metadata.shipping_fee = 0;
        delivery.fee = 0;
      }
      cart = await commerce.updateCart(args.session_id, { shipping_address: address, metadata, flow_step: 'confirming_address' });
      const newSummary = commerce.getCartSummary(cart);
      const addrText = address.full || `${address.street}${address.number ? ', ' + address.number : ''}${address.neighborhood ? ' - ' + address.neighborhood : ''}${address.city ? ', ' + address.city : ''}`;
      let msg = `📍 Endereço registrado: *${addrText}*\n`;
      if (delivery.fee > 0) {
        msg += `\n🚚 Taxa de entrega: *R$ ${delivery.fee.toFixed(2)}*`;
        if (freeAbove > 0) msg += ` (grátis acima de R$ ${freeAbove.toFixed(2)})`;
      } else {
        msg += '\n🚚 Frete: *Grátis!*';
      }
      msg += `\n⏰ Previsão de entrega: *${delivery.estimatedMinutes} min*`;
      msg += `\n\n💰 Total: *R$ ${newSummary.total.toFixed(2)}*`;
      msg += '\n\nQual a forma de pagamento? (PIX, Dinheiro, Cartão)';
      return { success: true, address, delivery, total: newSummary.total, message: msg };
    }

    case 'commerce_set_payment': {
      const commerce = require('../erp/commerce');
      let cart = await commerce.getCart(args.session_id);
      if (!cart) return { error: 'Carrinho não encontrado.' };
      let metadata = cart.metadata || {};
      metadata.payment_method = args.payment_method;
      if (args.payment_method === 'dinheiro' && args.change_for) {
        metadata.change_for = args.change_for;
      } else {
        delete metadata.change_for;
      }
      cart = await commerce.updateCart(args.session_id, { metadata, flow_step: 'confirming_payment' });
      const summary = commerce.getCartSummary(cart);
      const paymentLabel = commerce.PAYMENT_METHODS[args.payment_method] || args.payment_method;
      let msg = `💳 Forma de pagamento: *${paymentLabel}*\n`;
      if (metadata.change_for) {
        const change = metadata.change_for - summary.total;
        msg += `\nTroco para: R$ ${metadata.change_for.toFixed(2)}`;
        msg += `\nTroco: *R$ ${change.toFixed(2)}*`;
      }
      msg += `\n\n${commerce.formatCartForWhatsApp(cart)}`;
      msg += '\n\nEstá tudo correto para finalizar? (sim/não)';
      return { success: true, payment_method: args.payment_method, change_for: args.change_for, total: summary.total, message: msg };
    }

    case 'commerce_apply_coupon': {
      const commerce = require('../erp/commerce');
      const cart = await commerce.getCart(args.session_id);
      if (!cart || cart.items.length === 0) return { error: 'Carrinho vazio.' };
      const summary = commerce.getCartSummary(cart);
      const result = await commerce.applyCoupon(args.session_id, args.code, summary.subtotal);
      if (!result.valid) return result;
      const updatedCart = await commerce.getCart(args.session_id);
      const updatedSummary = commerce.getCartSummary(updatedCart);
      let msg = `🎉 Cupom *${result.code}* aplicado!`;
      if (result.type === 'percentage') {
        msg += `\nDesconto: ${result.value}%`;
      } else {
        msg += `\nDesconto: R$ ${result.value.toFixed(2)}`;
      }
      msg += `\n\nNovo total: *R$ ${updatedSummary.total.toFixed(2)}*`;
      return { success: true, ...result, new_total: updatedSummary.total, message: msg };
    }

    case 'commerce_finalize_order': {
      const commerce = require('../erp/commerce');
      const cart = await commerce.getCart(args.session_id);
      if (!cart || cart.items.length === 0) return { error: 'Carrinho vazio. Adicione itens antes de finalizar.' };
      if (!cart.shipping_address) return { error: 'Endereço de entrega não informado. Peça o endereço do cliente primeiro.' };
      const result = await commerce.finalizeOrder(args.session_id, args.source || 'whatsapp');
      if (result.error) return result;
      const changeFor = cart.metadata?.change_for;
      const summary = commerce.getCartSummary(cart);
      let msg = `✅ *Pedido confirmado!*\n\n📋 Pedido: *#${result.order_number}*\n`;
      msg += `\n${result.formatted}`;
      if (changeFor) {
        const change = changeFor - summary.total;
        msg += `\n\n💵 Pagamento em dinheiro: R$ ${changeFor.toFixed(2)}`;
        msg += `\n💵 Troco: R$ ${change.toFixed(2)}`;
      }
      msg += '\n\nO pedido foi enviado e você será avisado sobre o progresso! 🎉';
      return { ...result, message: msg };
    }

    case 'commerce_get_order': {
      return await erpOrders.getOrderByNumber(args.order_number)
        || await erpOrders.getOrder(args.order_number)
        || { error: 'Pedido não encontrado. Verifique o número.' };
    }

    case 'commerce_calculate_delivery': {
      const commerce = require('../erp/commerce');
      const result = await commerce.calculateDeliveryFee(args.address);
      let msg = `🚚 Cálculo de frete para: *${args.address}*\n`;
      if (result.fee > 0) {
        msg += `Taxa de entrega: R$ ${result.fee.toFixed(2)}`;
        if (result.freeAbove > 0) msg += ` (grátis acima de R$ ${result.freeAbove.toFixed(2)})`;
      } else {
        msg += 'Frete: *Grátis!*';
      }
      msg += `\nPrevisão: ${result.estimatedMinutes} minutos`;
      if (result.matchedZone) msg += `\nZona: ${result.matchedZone.name}`;
      return { ...result, message: msg };
    }

    default:
      return { error: `ERP tool desconhecida: ${name}` };
  }
}

module.exports = { ERP_TOOL_DEFINITIONS, executeERPTool };