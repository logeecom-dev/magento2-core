<?php

namespace Sequra\Core\Controller\Adminhtml\Configuration;

use Exception;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Store\Api\StoreConfigManagerInterface;
use Magento\Store\Model\StoreManagerInterface;
use SeQura\Core\BusinessLogic\AdminAPI\AdminAPI;
use SeQura\Core\BusinessLogic\AdminAPI\PromotionalWidgets\Requests\WidgetSettingsRequest;

/**
 * Class WidgetSettings
 *
 * @package Sequra\Core\Controller\Adminhtml\Configuration
 */
class WidgetSettings extends BaseConfigurationController
{
    /**
     * @var StoreConfigManagerInterface
     */
    private $storeConfigManager;
    /**
     * @var StoreManagerInterface
     */
    private $storeManager;

    public function __construct(
        Context $context,
        JsonFactory $jsonFactory,
        StoreConfigManagerInterface $storeConfigManager,
        StoreManagerInterface $storeManager
    )
    {
        parent::__construct($context, $jsonFactory);
        $this->storeConfigManager = $storeConfigManager;
        $this->storeManager = $storeManager;

        $this->allowedActions = ['getWidgetSettings', 'setWidgetSettings'];
    }

    /**
     * Retrieves widget settings.
     *
     * @return Json
     *
     * @throws Exception
     */
    protected function getWidgetSettings(): Json
    {
        $data = AdminAPI::get()->widgetConfiguration($this->storeId)->getWidgetSettings();

        $result = $data->toArray();

        if (empty($result)) {
            return $this->result->setData($result);
        }

        $result['widgetLabels']['message'] = isset($result['widgetLabels']['messages']) ?
            reset($result['widgetLabels']['messages']): '';
        $result['widgetLabels']['messageBelowLimit'] = isset($result['widgetLabels']['messagesBelowLimit']) ?
            reset($result['widgetLabels']['messagesBelowLimit']): '';
        $result['widgetStyles'] = json_encode($result['widgetConfiguration']);
        unset($result['widgetLabels']['messages'], $result['widgetLabels']['messagesBelowLimit']);
        unset($result['widgetConfiguration']);

        return $this->result->setData($result);
    }

    /**
     * Saves widget settings.
     *
     * @return Json
     *
     * @throws Exception
     */
    protected function setWidgetSettings(): Json
    {
        $data = $this->getSequraPostData();
        $store = $this->storeManager->getStore($this->storeId);
        $storeConfig = $this->storeConfigManager->getStoreConfigs([$store->getCode()])[0];

        $config = $data['widgetStyles'] ? json_decode($data['widgetStyles'], true) : [];
        $labels = $data['widgetLabels'] ?? [];
        $response = AdminAPI::get()->widgetConfiguration($this->storeId)->setWidgetSettings(
            new WidgetSettingsRequest(
                $data['useWidgets'],
                $data['assetsKey'],
                $data['displayWidgetOnProductPage'],
                $data['showInstallmentAmountInProductListing'],
                $data['showInstallmentAmountInCartPage'],
                $data['miniWidgetSelector'] ?? '',
                $config['type'] ?? '',
                $config['size'] ?? '',
                $config['font-color'] ?? '',
                $config['background-color'] ?? '',
                $config['alignment'] ?? '',
                $config['branding'] ?? '',
                $config['starting-text'] ?? '',
                $config['amount-font-size'] ?? '',
                $config['amount-font-color'] ?? '',
                $config['amount-font-bold'] ?? '',
                $config['link-font-color'] ?? '',
                $config['link-underline'] ?? '',
                $config['border-color'] ?? '',
                $config['border-radius'] ?? '',
                $config['no-costs-claim'] ?? '',
                $labels['message'] ? [$storeConfig->getLocale() => $labels['message']] : [],
                $labels['messageBelowLimit'] ? [$storeConfig->getLocale() => $labels['messageBelowLimit']] : []
            )
        );

        $this->addResponseCode($response);

        return $this->result->setData($response->toArray());
    }
}