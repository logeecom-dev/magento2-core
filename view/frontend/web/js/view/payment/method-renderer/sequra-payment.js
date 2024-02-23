define([
    'Magento_Checkout/js/view/payment/default',
    'ko',
    'jquery',
    'underscore',
    'Magento_Checkout/js/action/select-payment-method',
    'Magento_Checkout/js/action/set-payment-information',
    'Magento_Checkout/js/model/error-processor',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/checkout-data',
    'Magento_Checkout/js/model/full-screen-loader',
    'Sequra_Core/js/model/sequra-payment-service',
    'Magento_Checkout/js/model/payment/additional-validators'
], function (
    Component,
    ko,
    $,
    _,
    selectPaymentMethodAction,
    setPaymentInformationAction,
    errorProcessor,
    quote,
    checkoutData,
    fullScreenLoader,
    sequraPaymentService,
    additionalValidators
) {
    'use strict';

    var selectedProduct = ko.observable(null),
        sequraPaymentMethods = ko.observable([]),
        canReloadPayments = ko.observable(true);

    function getSelectedMethodAdditionalData() {
        var selectedPaymentMethod = _.find(sequraPaymentMethods(), function (method) {
            return method.product === selectedProduct();
        });

        if (!selectedPaymentMethod) {
            return null;
        }

        return {
            ssequra_product: selectedPaymentMethod.product,
            sequra_campaign: selectedPaymentMethod.campaign
        };
    }

    return Component.extend({
        defaults: {
            template: 'Sequra_Core/payment/form'
        },

        initObservable: function () {
            this._super().observe([
                'selectedProduct',
                'sequraPaymentMethods'
            ]);
            return this;
        },

        initialize: function () {
            var self = this;
            this._super();

            fullScreenLoader.startLoader();

            var paymentMethodsObserver = sequraPaymentService.getPaymentMethods();

            // Subscribe to any further changes (shipping address might change on the payment page)
            paymentMethodsObserver.subscribe(function (paymentMethodsResponse) {
                self.loadSequraPaymentMethods(paymentMethodsResponse);
            });

            self.loadSequraPaymentMethods(paymentMethodsObserver());

            quote.billingAddress.subscribe(function (address) {
                if (!address || !canReloadPayments()) {
                    return;
                }

                canReloadPayments(false);

                fullScreenLoader.startLoader();

                sequraPaymentService.retrievePaymentMethods().done(function (paymentMethods) {
                    sequraPaymentService.setPaymentMethods(paymentMethods);
                    fullScreenLoader.stopLoader();
                }).fail(function () {
                    console.log('Fetching the payment methods failed!');
                }).always(function () {
                    fullScreenLoader.stopLoader();
                    canReloadPayments(true);
                });
            }, this);
        },

        loadSequraPaymentMethods: function (paymentMethodsResponse) {
            var self = this;

            self.sequraPaymentMethods(paymentMethodsResponse);
            sequraPaymentMethods(paymentMethodsResponse);

            fullScreenLoader.stopLoader();
        },

        getCode: function () {
            return 'sequra_payment';
        },

        isVisible: function () {
            return true;
        },

        getSelectedProduct: ko.computed(function () {
            if (!quote.paymentMethod()) {
                return null;
            }

            if (quote.paymentMethod().method === 'sequra_payment') {
                return selectedProduct();
            }

            return null;
        }),

        selectProduct: function () {
            var self = this;

            selectedProduct(self.product);

            // set payment method to sequra_payment
            var data = {
                'method': 'sequra_payment',
                'po_number': null,
                'additional_data': getSelectedMethodAdditionalData(),
            };

            selectPaymentMethodAction(data);
            checkoutData.setSelectedPaymentMethod('sequra_payment');

            return true;
        },

        placeOrder: function () {
            var self = this;

            if (!additionalValidators.validate() || self.isPlaceOrderActionAllowed() !== true) {
                return false;
            }

            // set payment method to sequra_payment
            var data = {
                'method': 'sequra_payment',
                'po_number': null,
                'additional_data': getSelectedMethodAdditionalData(),
            };

            fullScreenLoader.startLoader();
            $.when(
                selectPaymentMethodAction(data),
                checkoutData.setSelectedPaymentMethod('sequra_payment'),
                setPaymentInformationAction(self.messageContainer, data)
            ).done(function () {
                if (window.checkoutConfig.payment.sequra_payment.showSeQuraCheckoutAsHostedPage) {
                    const hppPageUrl = new URL(
                        window.checkoutConfig.payment.sequra_payment.sequraCheckoutHostedPage
                    );

                    hppPageUrl.searchParams.append("ssequra_product", data.additional_data.ssequra_product);
                    hppPageUrl.searchParams.append(
                        "sequra_campaign", data.additional_data.sequra_campaign || ''
                    );

                    window.location.replace(hppPageUrl.href);

                    return;
                }

                sequraPaymentService.fetchIdentificationForm(data.additional_data).done(function (response) {
                    fullScreenLoader.stopLoader();
                    self.showIdentificationForm(response);
                }).fail(function (response) {
                    errorProcessor.process(response, self.messageContainer);
                    fullScreenLoader.stopLoader();
                });
            }).fail(function (response) {
                errorProcessor.process(response, self.messageContainer);
                fullScreenLoader.stopLoader();
            });

            return false;
        },

        showIdentificationForm: function (identificationForm) {
            function waitForSequraFormInstance(callback) {
                if (typeof window.SequraFormInstance === 'undefined') {
                    setTimeout(waitForSequraFormInstance, 100, callback);
                    return;
                }

                callback();
            }

            function showForm() {
                window.SequraFormInstance.setCloseCallback(function () {
                    fullScreenLoader.stopLoader();
                    // Add additional stop since in some cases magento keeps one loader on the page
                    fullScreenLoader.stopLoader();
                    window.SequraFormInstance.defaultCloseCallback();
                    delete window.SequraFormInstance;
                });

                window.SequraFormInstance.show();
                fullScreenLoader.stopLoader();
            }

            fullScreenLoader.startLoader();
            $('body').append(identificationForm);
            waitForSequraFormInstance(showForm);
        },

        getAmount: function () {
            var totals = quote.getTotals()();
            if (totals) {
                return Math.round(totals['base_grand_total'] * 100);
            }
            return Math.round(quote['base_grand_total'] * 100);
        },

        showLogo: function () {
            return window.checkoutConfig.payment.sequra_payment.showlogo;
        },

        showWidgets: function () {
            return window.checkoutConfig.payment.sequra_payment.showwidgets;
        },

        loadSeQuraScript: function () {
            if (!window.checkoutConfig.payment.sequra_payment.widget_settings.hasOwnProperty('merchant')) {
                return;
            }

            if (typeof Sequra === "undefined") {
                let products = [];
                window.checkoutConfig.payment.sequra_payment.widget_settings.products.forEach((product) => {
                    products.push(product.id);
                });
                var sequraConfigParams = {
                    merchant: window.checkoutConfig.payment.sequra_payment.widget_settings.merchant,
                    assetKey: window.checkoutConfig.payment.sequra_payment.widget_settings.assetKey,
                    products: products,
                    scriptUri: window.checkoutConfig.payment.sequra_payment.widget_settings.scriptUri,
                    decimalSeparator: window.checkoutConfig.payment.sequra_payment.widget_settings.decimalSeparator,
                    thousandSeparator: window.checkoutConfig.payment.sequra_payment.widget_settings.thousandSeparator,
                    locale: window.checkoutConfig.payment.sequra_payment.widget_settings.locale,
                    currency: window.checkoutConfig.payment.sequra_payment.widget_settings.currency,
                };

                (
                    function (i, s, o, g, r, a, m) {
                        i["SequraConfiguration"] = g;
                        i["SequraOnLoad"] = [];
                        i[r] = {};
                        i[r][a] = function (callback) {
                            i["SequraOnLoad"].push(callback);
                        };
                        (a = s.createElement(o)),
                            (m = s.getElementsByTagName(o)[0]);
                        a.async = 1;
                        a.src = g.scriptUri;
                        m.parentNode.insertBefore(a, m);
                    }
                )
                (window, document, "script", sequraConfigParams, "Sequra", "onLoad");
            } else {
                Sequra.refreshComponents?.();
            }
        }
    });
});
