<?php

namespace Sequra\Core\Observer;

use Exception;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Address as MagentoAddress;
use SeQura\Core\BusinessLogic\Domain\Multistore\StoreContext;
use SeQura\Core\BusinessLogic\Domain\Order\Models\OrderUpdateData;
use SeQura\Core\BusinessLogic\Domain\Order\Service\OrderService;
use Sequra\Core\Controller\Webhook\Index as WebhookController;
use SeQura\Core\Infrastructure\Logger\Logger;
use SeQura\Core\Infrastructure\ServiceRegister;
use Sequra\Core\Services\BusinessLogic\Utility\TransformEntityService;

/**
 * Class OrderAddressObserver
 *
 * @package Sequra\Core\Observer
 */
class OrderAddressObserver implements ObserverInterface
{
    /**
     * @inheritDoc
     *
     * @throws LocalizedException
     */
    public function execute(Observer $observer): void
    {
        if(WebhookController::isWebhookProcessing()) {
            return;
        }

        $addressData = $observer->getData('data_object');

        try {
            $this->handleAddressUpdate($addressData);
        } catch (Exception $e) {
            $this->handleAddressUpdateError($e);
        }
    }

    /**
     * Handles address update.
     *
     * @param MagentoAddress $magentoAddress
     *
     * @return void
     *
     * @throws Exception
     */
    private function handleAddressUpdate(MagentoAddress $magentoAddress): void
    {
        $magentoOrder = $magentoAddress->getOrder();
        if ($magentoOrder->getStatus() === Order::STATE_PAYMENT_REVIEW) {
            throw new LocalizedException(__('Order with "payment review" status cannot be updated.'));
        }

        $isShippingAddress = $magentoAddress->getAddressType() === 'shipping';
        $address = TransformEntityService::transformAddressToSeQuraOrderAddress($magentoAddress);

        StoreContext::doWithStore($magentoOrder->getStoreId(), [$this->getOrderService(), 'updateOrder'], [
            new OrderUpdateData(
                $magentoOrder->getIncrementId(), null, null,
                $isShippingAddress ? $address : null,
                !$isShippingAddress ? $address : null
            )
        ]);
    }

    /**
     * Returns an instance of Order service.
     *
     * @return OrderService
     */
    private function getOrderService(): OrderService
    {
        if (!isset($this->orderService)) {
            $this->orderService = ServiceRegister::getService(OrderService::class);
        }

        return $this->orderService;
    }

    /**
     * Handles the update address errors.
     *
     * @param Exception $e
     *
     * @return void
     *
     * @throws LocalizedException
     */
    private function handleAddressUpdateError(Exception $e): void
    {
        Logger::logError('Order synchronization for address update failed. ' . $e->getMessage(), 'Integration');

        if ($e instanceof LocalizedException) {
            throw $e;
        }
    }
}