<?php

namespace App\Controller;

use App\Entity\Phone;
use App\Repository\PhoneRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * App A's own UI — the forms to put information about phones (specs).
 */
class PhoneController extends AbstractController
{
    #[Route('/', name: 'phone_index', methods: ['GET'])]
    public function index(PhoneRepository $phones): Response
    {
        return $this->render('phone/index.html.twig', ['phones' => $phones->search(null)]);
    }

    #[Route('/phones/new', name: 'phone_new', methods: ['GET'])]
    public function new(): Response
    {
        return $this->render('phone/new.html.twig');
    }

    #[Route('/phones', name: 'phone_create', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em): Response
    {
        $phone = new Phone();
        $phone->setBrand(trim((string) $request->request->get('brand')));
        $phone->setModel(trim((string) $request->request->get('model')));

        $year = $request->request->get('releaseYear');
        $phone->setReleaseYear($year !== null && $year !== '' ? (int) $year : null);

        $storage = array_values(array_filter(array_map(
            'trim',
            explode(',', (string) $request->request->get('storageOptions')),
        )));
        $phone->setStorageOptions($storage);

        if ($phone->getBrand() !== '' && $phone->getModel() !== '') {
            $em->persist($phone);
            $em->flush();
        }

        return $this->redirectToRoute('phone_index');
    }
}
