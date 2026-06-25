<?php

namespace App\Entity;

use App\Repository\PhoneRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: PhoneRepository::class)]
class Phone
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 80)]
    private string $brand = '';

    #[ORM\Column(length: 120)]
    private string $model = '';

    #[ORM\Column(nullable: true)]
    private ?int $releaseYear = null;

    #[ORM\Column(type: Types::JSON)]
    private array $storageOptions = [];

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getBrand(): string { return $this->brand; }
    public function setBrand(string $brand): self { $this->brand = $brand; return $this; }
    public function getModel(): string { return $this->model; }
    public function setModel(string $model): self { $this->model = $model; return $this; }
    public function getReleaseYear(): ?int { return $this->releaseYear; }
    public function setReleaseYear(?int $year): self { $this->releaseYear = $year; return $this; }
    public function getStorageOptions(): array { return $this->storageOptions; }
    public function setStorageOptions(array $options): self { $this->storageOptions = $options; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    /** Canonical display name — the single source of truth other apps reference. */
    public function getName(): string
    {
        return trim($this->brand . ' ' . $this->model);
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'brand' => $this->brand,
            'model' => $this->model,
            'name' => $this->getName(),
            'releaseYear' => $this->releaseYear,
            'storageOptions' => $this->storageOptions,
            'createdAt' => $this->createdAt->format(\DateTimeInterface::ATOM),
        ];
    }
}
